"""Authentication stays available while heavyweight AI services remain cold."""

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import main
from app.db.models import Base
from app.db.session import get_db


def test_login_before_ai_initialization(monkeypatch):
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    monkeypatch.setattr(main, 'init_db', lambda: None)
    monkeypatch.setattr(main, 'create_checkpointer', lambda: None)
    monkeypatch.setattr(main, 'close_checkpointer', lambda _: None)
    app = main.create_app()

    def database():
        with sessions() as db:
            yield db
    app.dependency_overrides[get_db] = database

    try:
        with TestClient(app) as client:
            assert app.state.ai_status == 'cold'
            assert not hasattr(app.state, 'embeddings')
            credentials = {'email': 'student@example.com', 'password': 'test-password'}
            signup = client.post('/auth/signup', json={'name': 'Student', **credentials})
            assert signup.status_code == 201
            login = client.post('/auth/login', json=credentials)
            assert login.status_code == 200
            token = login.json()['token']
            headers = {'Authorization': f'Bearer {token}'}
            assert client.get('/auth/me', headers=headers).json()['email'] == credentials['email']
            assert client.post('/auth/login', json={**credentials, 'password': 'wrong'}).status_code == 401
            assert client.post('/auth/logout', headers=headers).status_code == 204
            assert client.get('/auth/me', headers=headers).status_code == 401
    finally:
        engine.dispose()
