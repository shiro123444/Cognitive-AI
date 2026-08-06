from datetime import datetime, timezone

from .db import db


def utc_now():
    return datetime.now(timezone.utc)


class Course(db.Model):
    id = db.Column(db.String, primary_key=True)
    title = db.Column(db.String, nullable=False)
    summary = db.Column(db.Text, nullable=False, default="")
    status = db.Column(db.String, nullable=False, default="published")
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)


class Chapter(db.Model):
    id = db.Column(db.String, primary_key=True)
    course_id = db.Column(db.String, db.ForeignKey("course.id"), nullable=False)
    order = db.Column(db.Integer, nullable=False, default=0)
    title = db.Column(db.String, nullable=False)
    objectives = db.Column(db.Text, nullable=False, default="")
    body = db.Column(db.Text, nullable=False, default="")
    course = db.relationship("Course", backref=db.backref("chapters", lazy=True))


class LearningActivity(db.Model):
    id = db.Column(db.String, primary_key=True)
    course_id = db.Column(db.String, db.ForeignKey("course.id"), nullable=False)
    chapter_id = db.Column(db.String, db.ForeignKey("chapter.id"), nullable=True)
    title = db.Column(db.String, nullable=False)
    activity_type = db.Column(db.String, nullable=False, default="reading")
    summary = db.Column(db.Text, nullable=False, default="")
    status = db.Column(db.String, nullable=False, default="draft")
    provider = db.Column(db.String, nullable=False, default="manual")
    launch_url = db.Column(db.Text, nullable=False, default="")
    config_json = db.Column(db.Text, nullable=False, default="{}")
    linked_concept_ids_json = db.Column(db.Text, nullable=False, default="[]")
    estimated_minutes = db.Column(db.Integer, nullable=False, default=20)
    release_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    course = db.relationship("Course", backref=db.backref("activities", lazy=True))
    chapter = db.relationship("Chapter", backref=db.backref("activities", lazy=True))


class Concept(db.Model):
    id = db.Column(db.String, primary_key=True)
    course_id = db.Column(db.String, db.ForeignKey("course.id"), nullable=False)
    label = db.Column(db.String, nullable=False)
    definition = db.Column(db.Text, nullable=False, default="")
    status = db.Column(db.String, nullable=False, default="published")
    scope_type = db.Column(db.String, nullable=False, default="course_global")
    owner_id = db.Column(db.String, nullable=False, default="")
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)


class GraphEdge(db.Model):
    id = db.Column(db.String, primary_key=True)
    course_id = db.Column(db.String, db.ForeignKey("course.id"), nullable=False)
    source_id = db.Column(db.String, db.ForeignKey("concept.id"), nullable=False)
    target_id = db.Column(db.String, db.ForeignKey("concept.id"), nullable=False)
    relationship = db.Column(db.String, nullable=False)
    status = db.Column(db.String, nullable=False, default="published")
    evidence = db.Column(db.Text, nullable=False, default="")
    scope_type = db.Column(db.String, nullable=False, default="course_global")
    owner_id = db.Column(db.String, nullable=False, default="")
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    source = db.relationship("Concept", foreign_keys=[source_id], backref=db.backref("outgoing_edges", lazy=True))
    target = db.relationship("Concept", foreign_keys=[target_id], backref=db.backref("incoming_edges", lazy=True))


class QuizItem(db.Model):
    id = db.Column(db.String, primary_key=True)
    chapter_id = db.Column(db.String, db.ForeignKey("chapter.id"), nullable=False)
    material_id = db.Column(db.String, db.ForeignKey("material.id"), nullable=True)
    prompt = db.Column(db.Text, nullable=False)
    answer = db.Column(db.Text, nullable=False)
    explanation = db.Column(db.Text, nullable=False, default="")


class ReviewItem(db.Model):
    id = db.Column(db.String, primary_key=True)
    title = db.Column(db.String, nullable=False)
    item_type = db.Column(db.String, nullable=False, default="graph_suggestion")
    status = db.Column(db.String, nullable=False, default="draft")
    payload_json = db.Column(db.Text, nullable=False, default="{}")
    reviewer = db.Column(db.String, nullable=False, default="")
    decision_notes = db.Column(db.Text, nullable=False, default="")
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)


class Material(db.Model):
    id = db.Column(db.String, primary_key=True)
    course_id = db.Column(db.String, db.ForeignKey("course.id"), nullable=False)
    filename = db.Column(db.String, nullable=False)
    path = db.Column(db.String, nullable=False)
    parser_status = db.Column(db.String, nullable=False, default="uploaded")
    chunk_count = db.Column(db.Integer, nullable=False, default=0)
    extraction_method = db.Column(db.String, nullable=False, default="")
    scope_type = db.Column(db.String, nullable=False, default="course_global")
    owner_id = db.Column(db.String, nullable=False, default="")
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    course = db.relationship("Course", backref=db.backref("materials", lazy=True))


class Chunk(db.Model):
    id = db.Column(db.String, primary_key=True)
    material_id = db.Column(db.String, db.ForeignKey("material.id"), nullable=False)
    text = db.Column(db.Text, nullable=False)
    citation_locator = db.Column(db.String, nullable=False, default="")
    page_number = db.Column(db.Integer, nullable=False, default=0)
    chunk_type = db.Column(db.String, nullable=False, default="text")
    heading = db.Column(db.String, nullable=True)
    material = db.relationship("Material", backref=db.backref("chunks", lazy=True))


class User(db.Model):
    """Lightweight user model for students, teachers, and admins.

    Roles: 'student' | 'teacher' | 'admin'.

    ``username`` is the login key (unique). ``password_hash`` is nullable so
    legacy seeded users without credentials remain valid for FK references but
    cannot log in until a password is set.
    """

    id = db.Column(db.String, primary_key=True)
    name = db.Column(db.String, nullable=False)
    email = db.Column(db.String, nullable=False, default="")
    role = db.Column(db.String, nullable=False, default="student")
    username = db.Column(db.String, nullable=True, unique=True)
    password_hash = db.Column(db.String, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)


class Assignment(db.Model):
    """A piece of work a teacher has assigned to a course."""

    id = db.Column(db.String, primary_key=True)
    course_id = db.Column(db.String, db.ForeignKey("course.id"), nullable=False)
    chapter_id = db.Column(db.String, db.ForeignKey("chapter.id"), nullable=True)
    activity_id = db.Column(db.String, db.ForeignKey("learning_activity.id"), nullable=True)
    title = db.Column(db.String, nullable=False)
    description = db.Column(db.Text, nullable=False, default="")
    assignment_type = db.Column(db.String, nullable=False, default="reading")
    # reading | quiz | code_lab | experiment | reflection | upload
    config_json = db.Column(db.Text, nullable=False, default="{}")
    created_by = db.Column(db.String, db.ForeignKey("user.id"), nullable=True)
    due_at = db.Column(db.DateTime, nullable=True)
    status = db.Column(db.String, nullable=False, default="draft")  # draft | published | archived
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    course = db.relationship("Course", backref=db.backref("assignments", lazy=True))


class Submission(db.Model):
    """A student's submission for an assignment."""

    id = db.Column(db.String, primary_key=True)
    assignment_id = db.Column(db.String, db.ForeignKey("assignment.id"), nullable=False)
    student_id = db.Column(db.String, db.ForeignKey("user.id"), nullable=False)
    content_json = db.Column(db.Text, nullable=False, default="{}")
    status = db.Column(db.String, nullable=False, default="submitted")
    # submitted | graded | returned
    score = db.Column(db.Float, nullable=True)
    feedback = db.Column(db.Text, nullable=False, default="")
    submitted_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    graded_at = db.Column(db.DateTime, nullable=True)
    assignment = db.relationship("Assignment", backref=db.backref("submissions", lazy=True))


class ProgressEvent(db.Model):
    """A timestamped event in a student's learning history.

    Examples: viewed_chapter, completed_quiz, asked_tutor, ran_lab.
    Aggregating these gives us per-student progress without forcing
    a tight join on every interaction.
    """

    id = db.Column(db.String, primary_key=True)
    student_id = db.Column(db.String, db.ForeignKey("user.id"), nullable=False)
    course_id = db.Column(db.String, db.ForeignKey("course.id"), nullable=True)
    chapter_id = db.Column(db.String, db.ForeignKey("chapter.id"), nullable=True)
    activity_id = db.Column(db.String, db.ForeignKey("learning_activity.id"), nullable=True)
    event_type = db.Column(db.String, nullable=False)
    # viewed | started | completed | answered_quiz | asked_tutor | submitted_assignment
    payload_json = db.Column(db.Text, nullable=False, default="{}")
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)


class Job(db.Model):
    """Background job for async processing.

    Used for heavy material processing (extraction, embedding, LLM concept extraction)
    so material uploads return immediately.
    """

    id = db.Column(db.String, primary_key=True)
    job_type = db.Column(db.String, nullable=False)  # ingest_material | extract_concepts | ...
    target_id = db.Column(db.String, nullable=True)  # ID of the entity being processed
    status = db.Column(db.String, nullable=False, default="pending")
    # pending | running | completed | failed
    payload_json = db.Column(db.Text, nullable=False, default="{}")
    result_json = db.Column(db.Text, nullable=False, default="{}")
    error_message = db.Column(db.Text, nullable=False, default="")
    progress = db.Column(db.Integer, nullable=False, default=0)  # 0-100
    progress_message = db.Column(db.String, nullable=False, default="")
    webhook_url = db.Column(db.String, nullable=True)
    webhook_secret = db.Column(db.String, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    started_at = db.Column(db.DateTime, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)


class AgentRun(db.Model):
    """A material-analysis agent run associated with an async job."""

    id = db.Column(db.String, primary_key=True)
    job_id = db.Column(db.String, nullable=False, default="")
    material_id = db.Column(db.String, db.ForeignKey("material.id"), nullable=True)
    course_id = db.Column(db.String, db.ForeignKey("course.id"), nullable=True)
    scope_type = db.Column(db.String, nullable=False, default="course_global")
    owner_id = db.Column(db.String, nullable=False, default="")
    status = db.Column(db.String, nullable=False, default="pending")
    summary_json = db.Column(db.Text, nullable=False, default="{}")
    error_message = db.Column(db.Text, nullable=False, default="")
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    updated_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    completed_at = db.Column(db.DateTime, nullable=True)
    material = db.relationship("Material", backref=db.backref("agent_runs", lazy=True))


class ExperimentTemplate(db.Model):
    id = db.Column(db.String, primary_key=True)
    title = db.Column(db.String, nullable=False)
    experiment_type = db.Column(db.String, nullable=False)
    adapter = db.Column(db.String, nullable=False)
    summary = db.Column(db.Text, nullable=False, default="")
    status = db.Column(db.String, nullable=False, default="draft")
    data_source = db.Column(db.String, nullable=False, default="synthetic")
    difficulty = db.Column(db.String, nullable=False, default="basic")
    estimated_minutes = db.Column(db.Integer, nullable=False, default=25)
    default_params_json = db.Column(db.Text, nullable=False, default="{}")
    linked_concept_ids_json = db.Column(db.Text, nullable=False, default="[]")
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)


class ExperimentRun(db.Model):
    id = db.Column(db.String, primary_key=True)
    template_id = db.Column(db.String, db.ForeignKey("experiment_template.id"), nullable=False)
    student_id = db.Column(db.String, db.ForeignKey("user.id"), nullable=True)
    course_id = db.Column(db.String, db.ForeignKey("course.id"), nullable=True)
    chapter_id = db.Column(db.String, db.ForeignKey("chapter.id"), nullable=True)
    activity_id = db.Column(db.String, db.ForeignKey("learning_activity.id"), nullable=True)
    status = db.Column(db.String, nullable=False, default="pending")
    adapter = db.Column(db.String, nullable=False)
    params_json = db.Column(db.Text, nullable=False, default="{}")
    summary_json = db.Column(db.Text, nullable=False, default="{}")
    error_message = db.Column(db.Text, nullable=False, default="")
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    completed_at = db.Column(db.DateTime, nullable=True)
    template = db.relationship("ExperimentTemplate", backref=db.backref("runs", lazy=True))


class ExperimentArtifact(db.Model):
    id = db.Column(db.String, primary_key=True)
    run_id = db.Column(db.String, db.ForeignKey("experiment_run.id"), nullable=False)
    artifact_type = db.Column(db.String, nullable=False)
    title = db.Column(db.String, nullable=False)
    data_json = db.Column(db.Text, nullable=False, default="{}")
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    run = db.relationship("ExperimentRun", backref=db.backref("artifacts", lazy=True))


class ExperimentReport(db.Model):
    id = db.Column(db.String, primary_key=True)
    run_id = db.Column(db.String, db.ForeignKey("experiment_run.id"), nullable=False)
    status = db.Column(db.String, nullable=False, default="draft")
    content_json = db.Column(db.Text, nullable=False, default="{}")
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    updated_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    run = db.relationship("ExperimentRun", backref=db.backref("reports", lazy=True))


class AgentEvent(db.Model):
    """Append-only event emitted by an agent run."""

    id = db.Column(db.String, primary_key=True)
    run_id = db.Column(db.String, db.ForeignKey("agent_run.id"), nullable=False)
    job_id = db.Column(db.String, nullable=False, default="")
    material_id = db.Column(db.String, nullable=False, default="")
    course_id = db.Column(db.String, nullable=False, default="")
    scope_type = db.Column(db.String, nullable=False, default="course_global")
    owner_id = db.Column(db.String, nullable=False, default="")
    event_type = db.Column(db.String, nullable=False)
    status = db.Column(db.String, nullable=False, default="running")
    message = db.Column(db.Text, nullable=False, default="")
    progress = db.Column(db.Integer, nullable=False, default=0)
    payload_json = db.Column(db.Text, nullable=False, default="{}")
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    run = db.relationship("AgentRun", backref=db.backref("events", lazy=True))


class EduDataset(db.Model):
    """Persisted EduFish normalized teaching-quality dataset."""

    id = db.Column(db.String, primary_key=True)
    name = db.Column(db.String, nullable=False)
    school_name = db.Column(db.String, nullable=False, default="")
    department_name = db.Column(db.String, nullable=False, default="")
    status = db.Column(db.String, nullable=False, default="ready")
    source_summary_json = db.Column(db.Text, nullable=False, default="{}")
    record_counts_json = db.Column(db.Text, nullable=False, default="{}")
    sample_preview_json = db.Column(db.Text, nullable=False, default="{}")
    normalized_data_json = db.Column(db.Text, nullable=False, default="{}")
    tenant_id = db.Column(db.String, nullable=False, default="default", index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    updated_at = db.Column(db.DateTime, nullable=False, default=utc_now)


class EduAnalysis(db.Model):
    """Persisted EduFish analysis result and graph summary."""

    id = db.Column(db.String, primary_key=True)
    dataset_id = db.Column(db.String, db.ForeignKey("edu_dataset.id"), nullable=False)
    template_id = db.Column(db.String, nullable=False, default="course-quality")
    audience_role = db.Column(db.String, nullable=False, default="school_admin")
    status = db.Column(db.String, nullable=False, default="pending")
    scope_json = db.Column(db.Text, nullable=False, default="{}")
    summary_json = db.Column(db.Text, nullable=False, default="{}")
    metrics_json = db.Column(db.Text, nullable=False, default="{}")
    insights_json = db.Column(db.Text, nullable=False, default="[]")
    graph_json = db.Column(db.Text, nullable=False, default="{}")
    graph_summary_json = db.Column(db.Text, nullable=False, default="{}")
    report_id = db.Column(db.String, nullable=True)
    error_message = db.Column(db.Text, nullable=False, default="")
    tenant_id = db.Column(db.String, nullable=False, default="default", index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    updated_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    dataset = db.relationship("EduDataset", backref=db.backref("edu_analyses", lazy=True))


class EduReport(db.Model):
    """Persisted EduFish report generated from an analysis."""

    id = db.Column(db.String, primary_key=True)
    analysis_id = db.Column(db.String, db.ForeignKey("edu_analysis.id"), nullable=False)
    dataset_id = db.Column(db.String, db.ForeignKey("edu_dataset.id"), nullable=False)
    template_id = db.Column(db.String, nullable=False, default="course-quality")
    status = db.Column(db.String, nullable=False, default="pending")
    title = db.Column(db.String, nullable=False, default="")
    sections_json = db.Column(db.Text, nullable=False, default="[]")
    markdown_content = db.Column(db.Text, nullable=False, default="")
    error_message = db.Column(db.Text, nullable=False, default="")
    tenant_id = db.Column(db.String, nullable=False, default="default", index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    updated_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    analysis = db.relationship("EduAnalysis", backref=db.backref("edu_reports", lazy=True))
