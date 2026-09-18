"""Authentication must work even while AI initialization is blocked or fails."""
import threading

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import main
from app.api.dependencies import get_embeddings
from app.db.models import Base
from app.db.session import get_db


def test_login_during_model_startup(monkeypatch):
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    started, release = threading.Event(), threading.Event()

    def slow_embeddings():
        started.set()
        assert release.wait(10), 'Test did not release model initialization'
        raise RuntimeError('Model unavailable')

    monkeypatch.setattr(main, 'init_db', lambda: None)
    monkeypatch.setattr(main, 'create_checkpointer', lambda: None)
    monkeypatch.setattr(main, 'close_checkpointer', lambda _: None)
    monkeypatch.setattr(main, 'get_embeddings', slow_embeddings)
    app = main.create_app()

    def database():
        with sessions() as db:
            yield db
    app.dependency_overrides[get_db] = database

    @app.get('/test-ai')
    def ai_probe():
        from starlette.requests import Request
        get_embeddings(Request({'type': 'http', 'app': app}))

    try:
        with TestClient(app) as client:
            try:
                assert started.wait(5)
                assert app.state.ai_status == 'loading'
                assert client.get('/test-ai').status_code == 503
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
                release.set()
        assert app.state.ai_status == 'error'
        with TestClient(app, raise_server_exceptions=True) as client:
            assert client.post('/auth/login', json=credentials).status_code == 200
    finally:
        engine.dispose()
