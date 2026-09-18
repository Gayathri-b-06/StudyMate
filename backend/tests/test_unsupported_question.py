"""Tests for unsupported-question handling and confidence thresholding (PRD §7)."""

from unittest.mock import MagicMock

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.runnables import RunnableConfig

from app.agent.nodes.chatbot import create_synthesis_node
from app.rag.retriever import RetrievedChunk
from app.tools.rag_tool import create_rag_tool


def test_rag_tool_returns_insufficient_evidence_artifact_below_threshold(monkeypatch):
    """Chunks below min_relevance_score=0.15 return an insufficient_evidence artifact."""
    def mock_retrieve_low(*args, **kwargs):
        assert kwargs.get("min_relevance_score") == 0.15
        return []

    monkeypatch.setattr("app.tools.rag_tool.retrieve", mock_retrieve_low)

    tool = create_rag_tool(
        embeddings=object(),
        vectorstore_path_resolver=lambda _: ["fake_path"],
    )

    config: RunnableConfig = {"configurable": {"thread_id": "thread-test"}}
    tool_msg = tool.invoke(
        {"name": "search_uploaded_documents", "args": {"query": "What is photosynthesis?"}, "id": "call-1", "type": "tool_call"},
        config=config,
    )

    assert tool_msg.artifact["status"] == "insufficient_evidence"
    assert "sufficient evidence" in tool_msg.content.lower()


def test_rag_tool_returns_evidence_found_artifact_above_threshold(monkeypatch):
    """Chunks above threshold return evidence_found artifact with top confidence score."""
    def mock_retrieve_high(*args, **kwargs):
        assert kwargs.get("min_relevance_score") == 0.15
        return [
            RetrievedChunk(
                content="Dropout prevents complex co-adaptations.",
                source="paper.pdf",
                page=0,
                similarity_score=0.8,
                relevance_score=0.95,
            )
        ]

    monkeypatch.setattr("app.tools.rag_tool.retrieve", mock_retrieve_high)

    tool = create_rag_tool(
        embeddings=object(),
        vectorstore_path_resolver=lambda _: ["fake_path"],
    )

    config: RunnableConfig = {"configurable": {"thread_id": "thread-test"}}
    tool_msg = tool.invoke(
        {"name": "search_uploaded_documents", "args": {"query": "What is dropout?"}, "id": "call-2", "type": "tool_call"},
        config=config,
    )

    assert tool_msg.artifact["status"] == "evidence_found"
    assert tool_msg.artifact["confidence"] == 0.95
    assert "[SOURCE:1]" in tool_msg.content


def test_synthesis_node_short_circuits_without_llm_call_on_insufficient_evidence():
    """Synthesis node skips LLM invocation entirely when tool artifact is insufficient_evidence."""
    mock_llm = MagicMock()
    synthesis_node = create_synthesis_node(mock_llm)

    state = {
        "intent": "document_qa",
        "messages": [
            HumanMessage(content="Explain photosynthesis"),
            ToolMessage(
                content="No relevant context",
                name="search_uploaded_documents",
                tool_call_id="call-1",
                artifact={"status": "insufficient_evidence", "confidence": 0.0},
            ),
        ],
    }

    result = synthesis_node(state, config={})
    assert len(result["messages"]) == 1
    ai_msg = result["messages"][0]
    assert isinstance(ai_msg, AIMessage)
    # LLM must NOT have been called
    assert mock_llm.invoke.call_count == 0
    # Response contains distinct warning callout
    assert "Insufficient Evidence in Project Documents" in ai_msg.content
    assert ai_msg.response_metadata.get("response_type") == "insufficient_evidence"


def test_synthesis_node_proceeds_with_llm_call_on_evidence_found():
    """Synthesis node invokes LLM normally when evidence is found."""
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = AIMessage(content="Dropout is a regularizer.")
    mock_llm.bind_tools.return_value = mock_llm
    synthesis_node = create_synthesis_node(mock_llm)

    state = {
        "intent": "document_qa",
        "messages": [
            HumanMessage(content="Explain dropout"),
            ToolMessage(
                content="Retrieved context: Dropout drops units.",
                name="search_uploaded_documents",
                tool_call_id="call-2",
                artifact={"status": "evidence_found", "confidence": 0.92},
            ),
        ],
    }

    result = synthesis_node(state, config={})
    assert mock_llm.invoke.call_count == 1
    ai_msg = result["messages"][0]
    assert ai_msg.content == "Dropout is a regularizer."


def test_off_topic_insufficient_evidence_produces_zero_citations():
    """Repro: An off-topic question yielding an insufficient_evidence callout produces 0 citations."""
    from app.services.chat_service import extract_citations_from_messages

    messages = [
        HumanMessage(content="latest telugu movie"),
        ToolMessage(
            content="Retrieved context do not contain sufficient evidence.",
            name="search_uploaded_documents",
            tool_call_id="call-repro-1",
            artifact={"status": "insufficient_evidence", "confidence": 0.0},
        ),
    ]
    refusal_response = (
        "> ⚠️ **Insufficient Evidence in Project Documents**\n\n"
        "Your project documents do not contain sufficient evidence to answer this question."
    )

    citations = extract_citations_from_messages(messages, refusal_response)
    assert citations == [], f"Expected 0 citations for insufficient-evidence callout, got {citations}"


def test_off_topic_generic_fallback_produces_zero_citations():
    """Repro: An off-topic question ('latest telugu movie') answered with a generic fallback

    (e.g., checking streaming services) without citing document chunks MUST NOT attach citations,
    even if candidates exist in the tool message.
    """
    from app.services.chat_service import extract_citations_from_messages

    messages = [
        HumanMessage(content="latest telugu movie"),
        ToolMessage(
            content=(
                "Retrieved uploaded-document context:\n\n"
                "[1] srivastava14a.pdf, page 19\nDropout neural networks.\n\n"
                "[2] srivastava14a.pdf, page 21\nError rates on MNIST.\n\n"
                "[3] srivastava14a.pdf, page 14\nWeight scaling inference.\n\n"
                "[4] srivastava14a.pdf, page 27\nLinear regression benchmarks."
            ),
            name="search_uploaded_documents",
            tool_call_id="call-repro-2",
            artifact=[
                {"document": "srivastava14a.pdf", "page": 19, "citation_id": 1},
                {"document": "srivastava14a.pdf", "page": 21, "citation_id": 2},
                {"document": "srivastava14a.pdf", "page": 14, "citation_id": 3},
                {"document": "srivastava14a.pdf", "page": 27, "citation_id": 4},
            ],
        ),
    ]

    # Model gives a helpful, honest generic answer about Telugu movies without fabricating PDF facts:
    generic_fallback_response = (
        "I don't have access to real-time movie schedules or the latest theatrical releases. "
        "You can check streaming services like Netflix, Prime Video, or Aha, or visit BookMyShow "
        "for the latest Telugu movie releases."
    )

    citations = extract_citations_from_messages(messages, generic_fallback_response)
    assert citations == [], f"Off-topic generic fallback must produce 0 citations! Got: {citations}"


def test_grounded_answer_with_markers_attaches_only_cited_citations():
    """Only chunks specifically cited via markers (e.g. [[cite:1]]) are attached."""
    from app.services.chat_service import extract_citations_from_messages

    messages = [
        HumanMessage(content="What is dropout?"),
        ToolMessage(
            content=(
                "Retrieved uploaded-document context:\n\n"
                "[1] srivastava14a.pdf, page 19\nDropout randomly omits units.\n\n"
                "[2] srivastava14a.pdf, page 21\nResults on MNIST."
            ),
            name="search_uploaded_documents",
            tool_call_id="call-repro-3",
            artifact=[
                {"document": "srivastava14a.pdf", "page": 19, "citation_id": 1},
                {"document": "srivastava14a.pdf", "page": 21, "citation_id": 2},
            ],
        ),
    ]

    # Model cites only passage 1
    grounded_response = "Dropout works by randomly dropping units during training [[cite:1]]."

    citations = extract_citations_from_messages(messages, grounded_response)
    assert len(citations) == 1
    assert citations[0].document == "srivastava14a.pdf"
    assert citations[0].page == 19


def test_telugu_movie_regression_produces_insufficient_evidence_and_no_llm_synthesis():
    """Live Bug Repro: Asking 'What is the latest Telugu movie?' against a Dropout paper

    must route to document_qa, execute RAG, receive insufficient_evidence from retriever,
    short-circuit synthesis WITHOUT calling LLM, and return response_type='insufficient_evidence'
    with sources=[].
    """
    from app.agent.nodes.chatbot import create_document_qa_node, create_synthesis_node
    from app.agent.intent_router import classify_intent, Intent
    from app.services.chat_service import extract_citations_from_messages

    query = "What is the latest Telugu movie?"
    # 1. Intent router classifies as DOCUMENT_QA
    intent = classify_intent(query)
    assert intent == Intent.DOCUMENT_QA

    # 2. Document QA node forces tool call even if LLM emitted no tool calls
    mock_llm_doc_qa = MagicMock()
    mock_llm_doc_qa.invoke.return_value = AIMessage(content="I think movies are cool.")  # model tried to answer directly
    mock_llm_doc_qa.bind_tools.return_value = mock_llm_doc_qa
    mock_rag_tool = MagicMock()
    mock_rag_tool.name = "search_uploaded_documents"

    doc_qa_node = create_document_qa_node(mock_llm_doc_qa, mock_rag_tool)
    state = {"messages": [HumanMessage(content=query)], "intent": "document_qa"}
    doc_qa_result = doc_qa_node(state, config={})
    ai_msg = doc_qa_result["messages"][0]
    assert len(ai_msg.tool_calls) == 1
    assert ai_msg.tool_calls[0]["name"] == "search_uploaded_documents"

    # 3. Tool execution returns insufficient_evidence (e.g. 0 chunks passed threshold)
    tool_msg = ToolMessage(
        content="The uploaded documents do not contain sufficient evidence to answer this question reliably.",
        name="search_uploaded_documents",
        tool_call_id=ai_msg.tool_calls[0]["id"],
        artifact={"status": "insufficient_evidence", "confidence": 0.0, "chunks": 0},
    )

    # 4. Synthesis node MUST short-circuit without calling synthesis LLM
    mock_synthesis_llm = MagicMock()
    synthesis_node = create_synthesis_node(mock_synthesis_llm)
    synthesis_state = {
        "messages": [HumanMessage(content=query), ai_msg, tool_msg],
        "intent": "document_qa",
    }
    synthesis_result = synthesis_node(synthesis_state, config={})

    # Synthesis LLM was NOT called
    assert mock_synthesis_llm.invoke.call_count == 0

    final_ai_msg = synthesis_result["messages"][0]
    assert final_ai_msg.response_metadata.get("response_type") == "insufficient_evidence"
    assert "Insufficient Evidence in Project Documents" in final_ai_msg.content
    assert "movie" not in final_ai_msg.content.lower()  # no hallucinated movie info

    # 5. Citations extraction yields empty list
    citations = extract_citations_from_messages(synthesis_state["messages"], final_ai_msg.content)
    assert citations == []


def test_what_is_dropout_supported_question_flow():
    """Supported question 'What is dropout?' retrieves evidence and calls synthesis LLM for grounded answer."""
    from app.agent.nodes.chatbot import create_synthesis_node
    from app.agent.intent_router import classify_intent, Intent
    from app.services.chat_service import extract_citations_from_messages

    query = "What is dropout?"
    assert classify_intent(query) == Intent.DOCUMENT_QA

    mock_synthesis_llm = MagicMock()
    mock_synthesis_llm.invoke.return_value = AIMessage(
        content="Dropout is a regularization technique that prevents overfitting [[cite:1]]."
    )
    mock_synthesis_llm.bind_tools.return_value = mock_synthesis_llm
    synthesis_node = create_synthesis_node(mock_synthesis_llm)

    tool_msg = ToolMessage(
        content="Retrieved uploaded-document context:\n\n[1] srivastava14a.pdf, page 1\nDropout: A simple way to prevent neural networks from overfitting.",
        name="search_uploaded_documents",
        tool_call_id="call-supported-1",
        artifact={"status": "evidence_found", "confidence": 0.99, "chunks": 1},
    )

    state = {
        "messages": [HumanMessage(content=query), tool_msg],
        "intent": "document_qa",
    }
    result = synthesis_node(state, config={})

    assert mock_synthesis_llm.invoke.call_count == 1
    final_msg = result["messages"][0]
    assert "Dropout is a regularization technique" in final_msg.content

    citations = extract_citations_from_messages(
        [
            ToolMessage(
                content="",
                name="search_uploaded_documents",
                tool_call_id="call-supported-1",
                artifact=[{"document": "srivastava14a.pdf", "page": 1, "citation_id": 1}],
            )
        ],
        final_msg.content,
    )
    assert len(citations) == 1
    assert citations[0].document == "srivastava14a.pdf"
    assert citations[0].page == 1


def test_conversational_hello_routes_to_general_chat():
    """Conversational greeting 'Hello' routes to general_chat and does not trigger document QA."""
    from app.agent.intent_router import classify_intent, Intent
    assert classify_intent("Hello") == Intent.GENERAL_CHAT
    assert classify_intent("hi") == Intent.GENERAL_CHAT
    assert classify_intent("Good morning") == Intent.GENERAL_CHAT


