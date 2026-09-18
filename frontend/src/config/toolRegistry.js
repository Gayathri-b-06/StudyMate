import { LayoutDashboard, MessageSquare, FileText, HelpCircle, Layers, TrendingUp, Calendar } from 'lucide-react'

export const WORKSPACES = [
  {
    id: 'overview',
    label: 'Overview',
    title: 'Project Overview',
    shortName: 'Overview',
    icon: LayoutDashboard,
    description: 'Project Dashboard & Quick Actions',
  },
  {
    id: 'chat',
    label: 'Chat',
    title: 'Chat Assistant',
    shortName: 'Chat',
    icon: MessageSquare,
    description: 'AI Study Assistant',
  },
  {
    id: 'documents',
    label: 'Documents',
    title: 'Course Documents',
    shortName: 'Document',
    icon: FileText,
    description: 'Course PDFs & Reference Materials',
  },
  {
    id: 'quiz',
    label: 'Quiz',
    title: 'Practice Quiz',
    shortName: 'Quiz',
    icon: HelpCircle,
    description: 'Interactive Practice Quizzes',
  },
  {
    id: 'flashcards',
    label: 'Flashcards',
    title: 'Flashcard Decks',
    shortName: 'Flashcard',
    icon: Layers,
    description: 'Spaced Repetition Decks',
  },
  {
    id: 'progress',
    label: 'Progress',
    title: 'Study Progress',
    shortName: 'Analytics',
    icon: TrendingUp,
    description: 'Overall Performance & Weak Topics',
  },
  {
    id: 'planner',
    label: 'Study Plan',
    title: 'Study Planner',
    shortName: 'Planner',
    icon: Calendar,
    description: 'Customized Study Schedules',
  },
]

export const WORKSPACE_TOOLS = WORKSPACES
