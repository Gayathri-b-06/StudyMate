"""Uploads and status polling must not wait for embedding model startup."""

from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import main
from app.db.models import Base
from app.db.session import get_db
from app.rag import embeddings as providers
from app.services import document_service


@pytest.fixture
def upload_app(monkeypatch, tmp_path):
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    monkeypatch.setattr(document_service, 'SessionLocal', sessions)
    monkeypatch.setattr(document_service, '_VECTORSTORE_DIR', tmp_path / 'indexes')
    queued = []
    monkeypatch.setattr(document_service, 'threading', SimpleNamespace(
        Thread=lambda **kw: SimpleNamespace(name=kw['name'], start=lambda: queued.append(kw)),
    ))
    app = main.create_app()

    def database():
        with sessions() as db:
            yield db

    app.dependency_overrides[get_db] = database
    # No lifespan: this test never opens the user's databases or checkpoints.
    client = TestClient(app)
    response = client.post('/auth/signup', json={
        'name': 'Upload test', 'email': 'upload@example.com', 'password': 'test-password',
    })
    client.headers['Authorization'] = 'Bearer ' + response.json()['token']
    space = client.post('/spaces', json={'name': 'Test'}).json()
    project = client.post(f"/spaces/{space['id']}/projects", json={'name': 'PDFs'}).json()
    yield client, project, queued
    client.close()
    engine.dispose()


@pytest.mark.parametrize('scope', ['projects', 'threads'])
def test_upload_and_poll_do_not_initialize_models(upload_app, monkeypatch, scope):
    client, project, queued = upload_app
    load = Mock(side_effect=RuntimeError('Model unavailable'))
    monkeypatch.setattr(main, 'get_embeddings', load)
    monkeypatch.setattr(providers, 'get_embeddings', load)
    scope_id = project['id'] if scope == 'projects' else project['default_thread_id']
    result = client.post(f'/{scope}/{scope_id}/documents/upload', files={
        'files': ('course.pdf', b'%PDF-1.4 test fixture', 'application/pdf'),
    })
    assert result.status_code == 202
    doc = result.json()['documents'][0]
    assert doc['index_status'] == 'uploaded'
    status = client.get(f"/documents/{doc['id']}/status")
    assert status.status_code == 200
    assert status.json()['index_status'] == 'uploaded'
    load.assert_not_called()
    assert len(queued) == 1

    # A failed model load is reported through status, not a hung upload request.
    queued[0]['target'](*queued[0]['args'])
    status = client.get(f"/documents/{doc['id']}/status").json()
    assert status['index_status'] == 'error'
    assert 'Model unavailable' in status['index_error']
    assert client.get('/auth/me').status_code == 200


def test_cleanup_failure_does_not_hide_indexing_error(monkeypatch):
    from app.rag import store

    persist = Mock()
    monkeypatch.setattr(document_service, '_persist_index_status', persist)
    monkeypatch.setattr(providers, 'get_embeddings', Mock(side_effect=RuntimeError('model failed')))
    monkeypatch.setattr(store, 'delete_index', Mock(side_effect=OSError('cleanup failed')))
    document_service._run_indexing_background('doc', 'test.pdf', b'pdf', 'unused-test-path', None)
    persist.assert_called_with('doc', status='error', error_message='model failed')


def test_background_indexing_reaches_ready(upload_app, monkeypatch):
    from langchain_core.documents import Document
    from langchain_core.embeddings import Embeddings
    from app.rag import ingest

    class TestEmbeddings(Embeddings):
        embedding_dimension = 3
        model_name = 'test-only'

        def embed_documents(self, texts):
            return [[1.0, 0.0, 0.0] for _ in texts]

        def embed_query(self, text):
            return [1.0, 0.0, 0.0]

    monkeypatch.setattr(providers, 'get_embeddings', lambda: TestEmbeddings())
    monkeypatch.setattr(ingest, 'load_and_chunk_pdf', lambda *args, **kwargs: (
        [Document(page_content='Photosynthesis uses sunlight.', metadata={'page': 0})],
        {'page_count': 1, 'chunk_count': 1},
    ))
    client, project, queued = upload_app
    response = client.post(f"/projects/{project['id']}/documents/upload", files={
        'files': ('course.pdf', b'%PDF-1.4 test fixture', 'application/pdf'),
    })
    assert response.status_code == 202
    doc = response.json()['documents'][0]
    queued[0]['target'](*queued[0]['args'])
    status = client.get(f"/documents/{doc['id']}/status").json()
    assert status['index_status'] == 'ready', status
    assert status['page_count'] == 1
    assert status['chunk_count'] == 1
