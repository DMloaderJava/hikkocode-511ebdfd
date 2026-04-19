interface Project {
  id: string;
  name: string;
  description: string | null;
  user_id: string;
  version: number;
  created_at: string;
  updated_at: string;
}

interface ChatMessage {
  id: string;
  project
