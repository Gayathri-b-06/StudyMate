"""Thin chatbot node factories for StudyMate's intent-routed graph.

Each factory creates a single LangGraph node that binds EXACTLY ONE tool
(or no tools for general_chat / synthesis).  Tool selection is already done
by the intent_router; these nodes are deliberately dumb — they just run the
correct model call.

Node map
--------
- ``create_general_chat_node``   → no tools, answers directly
- ``create_document_qa_node``    → binds search_uploaded_documents
- ``create_quiz_node``           → binds generate_document_quiz
- ``create_flashcard_node``      → binds generate_document_flashcards
- ``create_study_plan_node``     → binds generate_document_study_plan
- ``create_progress_node``       → binds get_study_progress
- ``create_synthesis_node``      → no tools (tool_choice="none"); picks
                                   prompt based on state["intent"]
- ``create_no_document_node``    → pure Python, returns fixed reply
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Sequence

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, AnyMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import BaseTool

from app.agent.prompts import (
    CHATBOT_SYSTEM_PROMPT,
    GROUNDED_ANSWER_SYSTEM_PROMPT,
    QUIZ_RESULT_SYSTEM_PROMPT,
    STUDY_PROGRESS_RESULT_SYSTEM_PROMPT,
    with_memory_context,
)
from app.agent.state import AgentState

logger = logging.getLogger(__name__)

ChatbotNode = Callable[..., dict[str, list[AnyMessage]]]

_NO_DOCUMENT_REPLY = (
    "You haven't uploaded any documents to this conversation yet. "
    "Upload a PDF and then ask your question — I'll search it for you."
)

# ─────────────────────────────────────────────────────────────────────────────
# Shared helper
# ─────────────────────────────────────────────────────────────────────────────

def _invoke_and_log(
    llm_bound: BaseChatModel,
    messages: list[AnyMessage],
    node_name: str,
) -> AIMessage:
    """Invoke *llm_bound*, log the result, and return the AIMessage."""
    response = llm_bound.invoke(messages)
    logger.info(
        "%s response: content=%r tool_calls=%s",
        node_name,
        str(response.content)[:120],
        response.tool_calls,
    )
    return response


# ─────────────────────────────────────────────────────────────────────────────
# General chat — no tools
# ─────────────────────────────────────────────────────────────────────────────

def create_general_chat_node(
    llm: BaseChatModel,
    memory_context_provider: Callable[[], str] | None = None,
) -> ChatbotNode:
    """Node for GENERAL_CHAT intent: LLM only, no tools."""

    def general_chat(state: AgentState, config: RunnableConfig) -> dict[str, list[AnyMessage]]:
        messages = state.get("messages", [])
        is_new_thread = len(messages) == 1
        memory_context = (
            memory_context_provider()
            if is_new_thread and memory_context_provider
            else ""
        )
        system_prompt = with_memory_context(memory_context)
        logger.info("general_chat: answering without tools")
        response = _invoke_and_log(llm, [SystemMessage(content=system_prompt)] + list(messages), "general_chat")
        return {"messages": [response]}

    return general_chat


# ─────────────────────────────────────────────────────────────────────────────
# Document QA — binds search_uploaded_documents only
# ─────────────────────────────────────────────────────────────────────────────

def create_document_qa_node(llm: BaseChatModel, rag_tool: BaseTool) -> ChatbotNode:
    """Node for DOCUMENT_QA intent: binds only the RAG tool."""

    bound = llm.bind_tools([rag_tool])

    def document_qa(state: AgentState, config: RunnableConfig) -> dict[str, list[AnyMessage]]:
        messages = state.get("messages", [])
        logger.info("document_qa: binding search_uploaded_documents")
        response = _invoke_and_log(
            bound,
            [SystemMessage(content=CHATBOT_SYSTEM_PROMPT)] + list(messages),
            "document_qa",
        )
        return {"messages": [response]}

    return document_qa


# ─────────────────────────────────────────────────────────────────────────────
# Quiz — binds generate_document_quiz only
# ─────────────────────────────────────────────────────────────────────────────

def create_quiz_node(llm: BaseChatModel, quiz_tool: BaseTool) -> ChatbotNode:
    """Node for QUIZ intent: binds only the quiz-generation tool."""

    bound = llm.bind_tools([quiz_tool])

    def quiz(state: AgentState, config: RunnableConfig) -> dict[str, list[AnyMessage]]:
        messages = state.get("messages", [])
        logger.info("quiz: binding generate_document_quiz")
        response = _invoke_and_log(
            bound,
            [SystemMessage(content=CHATBOT_SYSTEM_PROMPT)] + list(messages),
            "quiz",
        )
        return {"messages": [response]}

    return quiz


# ─────────────────────────────────────────────────────────────────────────────
# Flashcard — binds generate_document_flashcards only
# ─────────────────────────────────────────────────────────────────────────────

def create_flashcard_node(llm: BaseChatModel, flashcard_tool: BaseTool) -> ChatbotNode:
    """Node for FLASHCARD intent: binds only the flashcard tool."""

    bound = llm.bind_tools([flashcard_tool])

    def flashcard(state: AgentState, config: RunnableConfig) -> dict[str, list[AnyMessage]]:
        messages = state.get("messages", [])
        logger.info("flashcard: binding generate_document_flashcards")
        response = _invoke_and_log(
            bound,
            [SystemMessage(content=CHATBOT_SYSTEM_PROMPT)] + list(messages),
            "flashcard",
        )
        return {"messages": [response]}

    return flashcard


# ─────────────────────────────────────────────────────────────────────────────
# Study plan — binds generate_document_study_plan only
# ─────────────────────────────────────────────────────────────────────────────

def create_study_plan_node(llm: BaseChatModel, study_plan_tool: BaseTool) -> ChatbotNode:
    """Node for STUDY_PLAN intent: binds only the study-planner tool."""

    bound = llm.bind_tools([study_plan_tool])

    def study_plan(state: AgentState, config: RunnableConfig) -> dict[str, list[AnyMessage]]:
        messages = state.get("messages", [])
        logger.info("study_plan: binding generate_document_study_plan")
        response = _invoke_and_log(
            bound,
            [SystemMessage(content=CHATBOT_SYSTEM_PROMPT)] + list(messages),
            "study_plan",
        )
        return {"messages": [response]}

    return study_plan


# ─────────────────────────────────────────────────────────────────────────────
# Progress — binds get_study_progress only
# ─────────────────────────────────────────────────────────────────────────────

def create_progress_node(llm: BaseChatModel, progress_tool: BaseTool) -> ChatbotNode:
    """Node for PROGRESS intent: binds only the study-progress tool."""

    bound = llm.bind_tools([progress_tool])

    def progress(state: AgentState, config: RunnableConfig) -> dict[str, list[AnyMessage]]:
        messages = state.get("messages", [])
        logger.info("progress: binding get_study_progress")
        response = _invoke_and_log(
            bound,
            [SystemMessage(content=CHATBOT_SYSTEM_PROMPT)] + list(messages),
            "progress",
        )
        return {"messages": [response]}

    return progress


# ─────────────────────────────────────────────────────────────────────────────
# Synthesis — runs after ToolNode; no tools, picks prompt from intent
# ─────────────────────────────────────────────────────────────────────────────

_SYNTHESIS_PROMPT_MAP: dict[str, str] = {
    "quiz"        : QUIZ_RESULT_SYSTEM_PROMPT,
    "progress"    : STUDY_PROGRESS_RESULT_SYSTEM_PROMPT,
    "flashcard"   : QUIZ_RESULT_SYSTEM_PROMPT,   # re-uses quiz result style
    "study_plan"  : QUIZ_RESULT_SYSTEM_PROMPT,   # brief "your plan is ready" style
    "document_qa" : GROUNDED_ANSWER_SYSTEM_PROMPT,
    "general_chat": CHATBOT_SYSTEM_PROMPT,
}


def create_synthesis_node(llm: BaseChatModel) -> ChatbotNode:
    """Post-tool synthesis node: no tools bound, produces the final answer.

    Uses ``state["intent"]`` to select the correct result system prompt so
    the model knows how to present each tool's structured output.
    """
    no_tool = llm.bind_tools([], tool_choice="none") if hasattr(llm, "bind_tools") else llm

    def synthesis(state: AgentState, config: RunnableConfig) -> dict[str, list[AnyMessage]]:
        intent = state.get("intent", "document_qa")
        system_prompt = _SYNTHESIS_PROMPT_MAP.get(intent, GROUNDED_ANSWER_SYSTEM_PROMPT)
        messages = state.get("messages", [])
        logger.info("synthesis: intent=%s, composing final answer", intent)
        response = _invoke_and_log(
            no_tool,
            [SystemMessage(content=system_prompt)] + list(messages),
            "synthesis",
        )
        return {"messages": [response]}

    return synthesis


# ─────────────────────────────────────────────────────────────────────────────
# No-document — pure Python, no LLM call
# ─────────────────────────────────────────────────────────────────────────────

def create_no_document_node() -> ChatbotNode:
    """Node for NO_DOCUMENT intent: returns a fixed reply, no LLM call made."""

    def no_document(state: AgentState, config: RunnableConfig) -> dict[str, list[AnyMessage]]:
        logger.info("no_document: short-circuit, returning fixed reply")
        return {"messages": [AIMessage(content=_NO_DOCUMENT_REPLY)]}

    return no_document
