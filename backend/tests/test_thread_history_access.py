"""History requests must resolve their user and return only the selected conversation."""
from types import SimpleNamespace
from unittest.mock import Mock

from fastapi import FastAPI
from fastapi.testclient import TestClient
from langchain_core.messages import HumanMessage, AIMessage

from app.api.dependencies import get_chat_service, get_current_user
from app.api.threads import router
from app.db.session import get_db
from app.services.chat_service import ChatService


def test_history_is_scoped_to_selected_thread_and_authenticated_user(monkeypatch):
    histories = {
        'greeting': [HumanMessage(content='hi'), AIMessage(content='Hello!')],
        'lesson': [HumanMessage(content='Explain vectors'), AIMessage(content='Vectors have magnitude and direction.')],
    }
    graph = Mock()
    graph.get_state.side_effect = lambda config: SimpleNamespace(values={'messages': histories[config['configurable']['thread_id']]})
    service = ChatService(graph)
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_chat_service] = lambda: service
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id='student-1')
    app.dependency_overrides[get_db] = lambda: None
    ownership = Mock(side_effect=lambda db, thread_id, user_id: object() if user_id == 'student-1' and thread_id in histories else None)
    monkeypatch.setattr('app.api.threads.crud.verify_thread_owner', ownership)
    with TestClient(app) as client:
        for thread_id in ['greeting', 'lesson', 'greeting', 'lesson']:
            response = client.get(f'/threads/{thread_id}/messages')
            assert response.status_code == 200
            assert [m['content'] for m in response.json()] == [m.content for m in histories[thread_id]]
            assert [m['role'] for m in response.json()] == ['user', 'assistant']
        assert client.get('/threads/missing/messages').status_code == 404
        calls_before = graph.get_state.call_count
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id='another-student')
        assert client.get('/threads/lesson/messages').status_code == 404
        assert graph.get_state.call_count == calls_before
    assert ownership.call_args.args[2] == 'another-student'
