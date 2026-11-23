export type Role = 'student' | 'company_member' | 'admin';
export type SkillStatus = 'studied' | 'practiced' | 'demonstrated' | 'company_verified';
export type Opportunity = { id:string; title:string; company:string; type:string; compensation:string; mode:string; duration:string; skills:string[]; description:string; sample?:boolean };

export type ProjectMilestone = {
  id: string;
  project_id: string;
  sequence: number;
  sequence_number: number;
  title: string;
  description: string;
  acceptance_criteria: string;
  required_deliverables: string[];
  deadline: string | null;
  is_required: boolean;
  created_at: string;
  updated_at: string;
};

export type ProjectAssignment = {
  id: string;
  project_id: string;
  student_user_id: string;
  company_id: string | null;
  company_user_id: string | null;
  assigned_by: string | null;
  status: 'active' | 'submitted' | 'revision_requested' | 'approved' | 'completed';
  started_at: string;
  submitted_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AssignmentMilestoneProgress = {
  id: string;
  assignment_id: string;
  milestone_id: string;
  status: 'not_started' | 'in_progress' | 'submitted' | 'revision_requested' | 'approved' | 'completed';
  submission_id: string | null;
  feedback: string | null;
  started_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectSubmission = {
  id: string;
  project_id: string;
  student_user_id: string;
  assignment_id: string | null;
  milestone_id: string | null;
  evidence: {
    storagePath?: string;
    fileName?: string;
    contentType?: string;
    size?: number;
  } | null;
  reflection: string | null;
  status: string;
  company_decision: 'approved' | 'revision_requested' | null;
  company_feedback: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type CourseworkMap = {
  id: string;
  student_user_id: string;
  source_file_name: string;
  course_name: string;
  career_goal: string;
  summary: string;
  concepts: unknown[];
  mapped_skills: unknown[];
  project_suggestions: unknown[];
  created_at: string;
  updated_at: string;
};

export type TheoryCertificate = {
  id: string;
  quiz_id: string;
  coursework_map_id: string;
  student_user_id: string;
  course_name: string;
  recipient_name: string;
  certificate_code: string;
  score: number;
  issued_at: string;
};
