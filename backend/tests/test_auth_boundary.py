"""Exercise real session authentication; no mocked current-user dependency."""
import re
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import main
from app.api.dependencies import get_quiz_llm, get_embeddings, get_rag_query_service
from app.config import DEFAULT_USER_ID
from app.db import session as database_module
from app.db.models import Base, User, Space, Project, Thread, Document
from app.db.session import get_db
from app.services import auth_service


@pytest.fixture
def boundary():
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    with sessions() as db:
        student = auth_service.create_user(db, name='Student', email='student@example.com', password='student-password')
        admin = auth_service.create_user(db, name='Admin', email='admin@example.com', password='admin-password', role='admin')
        student_id, admin_id = student.id, admin.id
        tokens = {'student': auth_service.create_session(db, student.id), 'admin': auth_service.create_session(db, admin.id)}
        space = Space(id='space', user_id=student_id, name='Study')
        project = Project(id='project', user_id=student_id, space=space, name='Course')
        thread = Thread(id='thread', project=project, title='Conversation')
        document = Document(id='document', thread=thread, filename='course.pdf', vectorstore_path='vectorstores/auth-test/document')
        db.add_all([space, project, thread, document]); db.commit()
    app = main.create_app()
    app.state.ai_status = 'loading'  # Authentication must run before model readiness checks.
    def database():
        with sessions() as db:
            yield db
    app.dependency_overrides[get_db] = database
    # Deliberately avoid lifespan: no real models, local DB, or checkpoints touched.
    with TestClient(app) as client:
        yield SimpleNamespace(app=app, client=client, sessions=sessions, tokens=tokens,
                              student_id=student_id, admin_id=admin_id, engine=engine)
    engine.dispose()


def headers(boundary, role='student'):
    return {'Authorization': 'Bearer ' + boundary.tokens[role]}


@pytest.mark.parametrize('authorization', [None, '', 'Bearer', 'Bearer ', 'Basic abc', 'Bearer invalid-token', 'Bearer one two'])
def test_every_protected_endpoint_rejects_unauthenticated_or_invalid_session(boundary, authorization):
    public = {('/auth/login', 'post'), ('/auth/signup', 'post')}
    request_headers = {} if authorization is None else {'Authorization': authorization}
    checked = 0
    for template, methods in boundary.app.openapi()['paths'].items():
        for method in methods:
            if method not in {'get', 'post', 'put', 'patch', 'delete'} or (template, method) in public:
                continue
            path = re.sub(r'{[^}]+}', 'unknown', template)
            response = boundary.client.request(method, path, headers=request_headers, json={})
            assert response.status_code == 401, (method, path, response.text)
            assert response.headers['www-authenticate'] == 'Bearer'
            checked += 1
    assert checked > 20


def test_identity_and_admin_role_come_from_backend_record(boundary):
    forged = {**headers(boundary), 'X-User-Id': boundary.admin_id, 'X-Role': 'admin', 'X-Admin': 'true'}
    me = boundary.client.get('/auth/me?role=admin', headers=forged)
    assert me.status_code == 200
    assert me.json()['id'] == boundary.student_id
    assert me.json()['role'] == 'student'
    assert boundary.client.get('/spaces', headers=forged).status_code == 200
    assert boundary.client.get('/admin/filter-options', headers=forged).status_code == 403
    admin = headers(boundary, 'admin')
    assert boundary.client.get('/auth/me', headers=admin).json()['role'] == 'admin'
    assert boundary.client.get('/admin/filter-options', headers=admin).status_code == 200
    # Previously issued sessions do not freeze role authority.
    with boundary.sessions() as db:
        db.get(User, boundary.admin_id).role = 'student'; db.commit()
    assert boundary.client.get('/admin/filter-options', headers=admin).status_code == 403


def test_public_signup_login_and_protected_logout(boundary):
    credentials = {'email': 'new@example.com', 'password': 'new-password'}
    response = boundary.client.post('/auth/signup', json={**credentials, 'name': 'New', 'role': 'admin', 'is_demo': True, 'id': DEFAULT_USER_ID})
    assert response.status_code == 201
    assert response.json()['user']['role'] == 'student'
    assert response.json()['user']['is_demo'] is False
    assert response.json()['user']['id'] != DEFAULT_USER_ID
    login = boundary.client.post('/auth/login', json=credentials)
    assert login.status_code == 200
    token_headers = {'Authorization': 'bearer ' + login.json()['token']}
    assert boundary.client.get('/auth/me', headers=token_headers).status_code == 200
    assert boundary.client.post('/auth/logout', headers=token_headers).status_code == 204
    assert boundary.client.get('/auth/me', headers=token_headers).status_code == 401
    assert boundary.client.get('/docs').status_code == 200
    assert boundary.client.get('/openapi.json').status_code == 200


@pytest.mark.parametrize('user_id,is_demo', [(DEFAULT_USER_ID, False), ('old-demo', True)])
def test_existing_demo_passwords_and_sessions_cannot_authenticate(boundary, user_id, is_demo):
    with boundary.sessions() as db:
        user = auth_service.create_user(db, user_id=user_id, name='Legacy', email='legacy@example.com', password='password123', role='admin', is_demo=is_demo)
        token = auth_service.create_session(db, user.id)
    assert boundary.client.post('/auth/login', json={'email': 'legacy@example.com', 'password': 'password123'}).status_code == 401
    assert boundary.client.get('/auth/me', headers={'Authorization': 'Bearer ' + token}).status_code == 401
    assert boundary.client.get('/admin/filter-options', headers={'Authorization': 'Bearer ' + token}).status_code == 401


def test_fresh_startup_does_not_seed_admin_or_demo_login(boundary, monkeypatch):
    fresh = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    factory = sessionmaker(bind=fresh)
    monkeypatch.setattr(database_module, 'engine', fresh)
    monkeypatch.setattr(database_module, 'SessionLocal', factory)
    monkeypatch.setattr(database_module, 'DATABASE_URL', 'sqlite://')
    try:
        database_module.init_db()
        with factory() as db:
            assert db.query(User).count() == 0
            owner = auth_service.seed_default_user(db)
            assert owner.role == 'student'
            assert not auth_service.can_authenticate(owner)
            assert not auth_service.verify_password('password123', owner.salt, owner.password_hash)
    finally:
        fresh.dispose()


def test_owned_documents_required_for_direct_ai_tools(boundary, monkeypatch):
    boundary.app.dependency_overrides[get_quiz_llm] = lambda: object()
    boundary.app.dependency_overrides[get_embeddings] = lambda: object()
    from app.api import routes_flashcards, routes_planner
    flash = Mock(return_value={'type':'tool_result', 'tool':'flashcards', 'document_id':'document', 'topic':'Vectors', 'cards':[]})
    plan = Mock(return_value={'document_id':'document', 'num_days':1, 'days':[]})
    monkeypatch.setattr(routes_flashcards, 'generate_flashcards', flash)
    monkeypatch.setattr(routes_planner, 'generate_study_plan', plan)
    service = Mock()
    service.query.return_value = {'answer':'Grounded', 'num_chunks':0, 'retrieved_chunks':[], 'sources':[]}
    boundary.app.dependency_overrides[get_rag_query_service] = lambda: service
    requests = [('/flashcards/generate', {'document_id':'document','topic':'Vectors','num_cards':3}),
                ('/planner/generate', {'document_id':'document','num_days':1}),
                ('/rag/query', {'index_path':'vectorstores/auth-test/document','query':'Explain vectors'})]
    for path, payload in requests:
        # An authenticated admin is still not the owner of this student's document.
        assert boundary.client.post(path, json=payload, headers=headers(boundary,'admin')).status_code == 404
        assert boundary.client.post(path, json=payload, headers=headers(boundary)).status_code == 200
    assert flash.call_count == plan.call_count == service.query.call_count == 1
