from app.db import db
from app.jwt_utils import hash_password
from app.models import Chapter, Concept, Course, GraphEdge, LearningActivity, QuizItem, User


_DEFAULT_USERS: tuple[dict[str, str], ...] = (
    {
        "id": "user-admin-default",
        "name": "Admin",
        "email": "admin@edufish.local",
        "role": "admin",
        "username": "admin",
        "password": "admin123",
    },
    {
        "id": "user-teacher-default",
        "name": "示范教师",
        "email": "teacher@edufish.local",
        "role": "teacher",
        "username": "teacher1",
        "password": "teacher123",
    },
    {
        "id": "user-student-default",
        "name": "示范学生",
        "email": "student@edufish.local",
        "role": "student",
        "username": "student1",
        "password": "student123",
    },
)


def seed_default_users() -> list[User]:
    """Idempotently create the demo admin/teacher/student accounts.

    Existing rows are not overwritten — passwords are only set for users
    missing one, so manual edits in dev are preserved.
    """
    seeded: list[User] = []
    for spec in _DEFAULT_USERS:
        user = db.session.get(User, spec["id"])
        if user is None:
            user = User(
                id=spec["id"],
                name=spec["name"],
                email=spec["email"],
                role=spec["role"],
                username=spec["username"],
                password_hash=hash_password(spec["password"]),
            )
            db.session.add(user)
        else:
            if user.username is None:
                user.username = spec["username"]
            if user.password_hash is None:
                user.password_hash = hash_password(spec["password"])
        seeded.append(user)
    db.session.commit()
    return seeded


def _merge_all(items):
    for item in items:
        db.session.merge(item)


def seed_courses():
    courses = [
        Course(
            id="ai-intro",
            title="人工智能导论",
            summary="Search, reasoning, machine learning, neural networks, reinforcement learning, language, vision, knowledge graphs, and AI ethics.",
        ),
        Course(
            id="brain-cog-intro",
            title="脑与认知科学导论",
            summary="Neurons, brain systems, attention, memory, language, emotion, consciousness, brain imaging, and cognitive models.",
        ),
    ]
    _merge_all(courses)

    chapters = [
        Chapter(id="ai-search", course_id="ai-intro", order=1, title="Search and Problem Solving", objectives="Understand state spaces, search strategies, and heuristic reasoning.", body="Search frames intelligence as finding paths through structured problem spaces."),
        Chapter(id="ai-learning", course_id="ai-intro", order=2, title="Learning and Neural Networks", objectives="Understand representation learning and neural network basics.", body="Neural networks learn layered representations from data."),
        Chapter(id="brain-attention", course_id="brain-cog-intro", order=1, title="Attention and Cognitive Control", objectives="Understand selective attention, working memory, and executive control.", body="Attention selects information for processing and action."),
        Chapter(id="brain-reward", course_id="brain-cog-intro", order=2, title="Reward and Decision Making", objectives="Understand reward systems and decision behavior.", body="Reward learning connects action, feedback, and future choice."),
    ]
    _merge_all(chapters)

    concepts = [
        Concept(id="concept-search", course_id="ai-intro", label="Heuristic Search", definition="利用启发式信息引导问题求解方向的搜索策略。A strategy for using estimates to guide problem solving."),
        Concept(id="concept-transformer-attention", course_id="ai-intro", label="Transformer Attention", definition="一种对上下文中的token关系进行加权建模的神经机制。A neural mechanism for weighting token relationships in context."),
        Concept(id="concept-human-attention", course_id="brain-cog-intro", label="Human Attention", definition="选择信息进行深度加工的认知过程。A cognitive process for selecting information for deeper processing."),
        Concept(id="concept-rl", course_id="ai-intro", label="Reinforcement Learning", definition="通过与环境的交互，从奖励和惩罚信号中学习最优行为的算法范式。Learning actions from rewards and penalties."),
        Concept(id="concept-reward-system", course_id="brain-cog-intro", label="Reward System", definition="涉及动机、价值评估和从结果中学习的神经系统。Neural systems involved in motivation, valuation, and learning from outcomes."),
    ]
    _merge_all(concepts)

    edges = [
        GraphEdge(id="edge-attention-related", course_id="ai-intro", source_id="concept-transformer-attention", target_id="concept-human-attention", relationship="RELATED_TO", evidence="Both involve selective weighting, but operate in different systems. 两者都涉及选择性加权机制，但运作于不同的系统。"),
        GraphEdge(id="edge-rl-reward", course_id="ai-intro", source_id="concept-rl", target_id="concept-reward-system", relationship="RELATED_TO", evidence="Reinforcement learning is inspired by reward-driven behavior and decision processes. 强化学习的灵感来源于奖励驱动的行为与决策过程。"),
        GraphEdge(id="edge-search-prereq", course_id="ai-intro", source_id="concept-search", target_id="concept-rl", relationship="PREREQUISITE_OF", evidence="Search concepts help explain planning in reinforcement learning. 搜索概念有助于理解强化学习中的规划问题。"),
    ]
    _merge_all(edges)

    activities = [
        LearningActivity(
            id="activity-ai-search-deck",
            course_id="ai-intro",
            chapter_id="ai-search",
            title="Lecture Deck: Search and Problem Solving",
            activity_type="lecture_deck",
            summary="A teacher-published deck introducing state spaces, uninformed search, and heuristics.",
            status="published",
            provider="slidev",
            config_json='{"format":"markdown","entry":"ai/search-and-problem-solving.md"}',
            linked_concept_ids_json='["concept-search"]',
            estimated_minutes=30,
        ),
        LearningActivity(
            id="activity-ai-search-lab",
            course_id="ai-intro",
            chapter_id="ai-search",
            title="Code Lab: Heuristic Search Sandbox",
            activity_type="code_lab",
            summary="Run and compare heuristic search strategies on a small pathfinding problem.",
            status="published",
            provider="jupyterlite",
            config_json='{"runtime":"python","entry":"labs/heuristic-search.ipynb"}',
            linked_concept_ids_json='["concept-search"]',
            estimated_minutes=40,
        ),
        LearningActivity(
            id="activity-brain-attention-deck",
            course_id="brain-cog-intro",
            chapter_id="brain-attention",
            title="Lecture Deck: Attention and Cognitive Control",
            activity_type="lecture_deck",
            summary="A teacher-published deck connecting selective attention, working memory, and control.",
            status="published",
            provider="revealjs",
            config_json='{"format":"markdown","entry":"brain/attention-control.md"}',
            linked_concept_ids_json='["concept-human-attention"]',
            estimated_minutes=30,
        ),
        LearningActivity(
            id="activity-brain-stroop",
            course_id="brain-cog-intro",
            chapter_id="brain-attention",
            title="Cognitive Experiment: Stroop Task",
            activity_type="cognitive_experiment",
            summary="Measure reaction time and interference in a browser-based attention experiment.",
            status="published",
            provider="jspsych",
            config_json='{"experiment":"stroop","trials":24}',
            linked_concept_ids_json='["concept-human-attention"]',
            estimated_minutes=20,
        ),
        LearningActivity(
            id="activity-brain-eeg-demo",
            course_id="brain-cog-intro",
            chapter_id="brain-attention",
            title="Neuro Data Lab: EEG Attention Demo",
            activity_type="bci_dataset_lab",
            summary="Inspect sample EEG-like signals and connect event-related changes to attention.",
            status="draft",
            provider="mne-python",
            config_json='{"dataset":"sample-eeg-attention","entry":"labs/eeg-attention-demo.ipynb"}',
            linked_concept_ids_json='["concept-human-attention"]',
            estimated_minutes=45,
        ),
    ]
    _merge_all(activities)

    quiz_items = [
        QuizItem(id="quiz-ai-search-1", chapter_id="ai-search", prompt="What is the role of a heuristic in search?", answer="It estimates which states are more promising.", explanation="A heuristic guides search without guaranteeing perfect knowledge."),
        QuizItem(id="quiz-brain-attention-1", chapter_id="brain-attention", prompt="How is human attention different from transformer attention?", answer="Human attention is a biological cognitive process; transformer attention is a computational weighting mechanism.", explanation="They are analogous but not identical."),
    ]
    _merge_all(quiz_items)
    db.session.commit()
