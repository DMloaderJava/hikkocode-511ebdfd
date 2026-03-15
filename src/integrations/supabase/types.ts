export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agent_tasks: {
        Row: {
          branch: string | null
          build_log: string | null
          commit_sha: string | null
          completed_at: string | null
          created_at: string
          error: string | null
          files_changed: string[] | null
          id: string
          iterations: number | null
          max_iterations: number | null
          patches: Json | null
          plan: Json | null
          pr_number: number | null
          pr_url: string | null
          project_id: string
          repo: string | null
          started_at: string | null
          status: string
          test_log: string | null
          updated_at: string
          user_id: string
          user_request: string
        }
        Insert: {
          branch?: string | null
          build_log?: string | null
          commit_sha?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          files_changed?: string[] | null
          id?: string
          iterations?: number | null
          max_iterations?: number | null
          patches?: Json | null
          plan?: Json | null
          pr_number?: number | null
          pr_url?: string | null
          project_id: string
          repo?: string | null
          started_at?: string | null
          status?: string
          test_log?: string | null
          updated_at?: string
          user_id: string
          user_request: string
        }
        Update: {
          branch?: string | null
          build_log?: string | null
          commit_sha?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          files_changed?: string[] | null
          id?: string
          iterations?: number | null
          max_iterations?: number | null
          patches?: Json | null
          plan?: Json | null
          pr_number?: number | null
          pr_url?: string | null
          project_id?: string
          repo?: string | null
          started_at?: string | null
          status?: string
          test_log?: string | null
          updated_at?: string
          user_id?: string
          user_request?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      applied_patches: {
        Row: {
          action: string
          applied_at: string
          file_path: string
          full_content: string | null
          id: string
          patch_content: string | null
          reverted: boolean | null
          reverted_at: string | null
          task_id: string
        }
        Insert: {
          action?: string
          applied_at?: string
          file_path: string
          full_content?: string | null
          id?: string
          patch_content?: string | null
          reverted?: boolean | null
          reverted_at?: string | null
          task_id: string
        }
        Update: {
          action?: string
          applied_at?: string
          file_path?: string
          full_content?: string | null
          id?: string
          patch_content?: string | null
          reverted?: boolean | null
          reverted_at?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applied_patches_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "agent_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          project_id: string
          role: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          project_id: string
          role: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          project_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      file_index: {
        Row: {
          created_at: string
          dependencies: Json | null
          embedding: Json | null
          file_path: string
          hash: string | null
          id: string
          language: string
          last_indexed_at: string
          project_id: string
          size_bytes: number | null
          summary: string | null
          symbols: Json | null
        }
        Insert: {
          created_at?: string
          dependencies?: Json | null
          embedding?: Json | null
          file_path: string
          hash?: string | null
          id?: string
          language?: string
          last_indexed_at?: string
          project_id: string
          size_bytes?: number | null
          summary?: string | null
          symbols?: Json | null
        }
        Update: {
          created_at?: string
          dependencies?: Json | null
          embedding?: Json | null
          file_path?: string
          hash?: string | null
          id?: string
          language?: string
          last_indexed_at?: string
          project_id?: string
          size_bytes?: number | null
          summary?: string | null
          symbols?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "file_index_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_files: {
        Row: {
          content: string
          created_at: string
          id: string
          language: string
          name: string
          path: string
          project_id: string
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          language: string
          name: string
          path: string
          project_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          language?: string
          name?: string
          path?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      task_logs: {
        Row: {
          created_at: string
          detail: Json | null
          id: string
          level: string
          message: string
          phase: string | null
          task_id: string
        }
        Insert: {
          created_at?: string
          detail?: Json | null
          id?: string
          level?: string
          message: string
          phase?: string | null
          task_id: string
        }
        Update: {
          created_at?: string
          detail?: Json | null
          id?: string
          level?: string
          message?: string
          phase?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "agent_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      version_snapshots: {
        Row: {
          created_at: string
          files: Json
          id: string
          project_id: string
          prompt: string | null
          version: number
        }
        Insert: {
          created_at?: string
          files?: Json
          id?: string
          project_id: string
          prompt?: string | null
          version: number
        }
        Update: {
          created_at?: string
          files?: Json
          id?: string
          project_id?: string
          prompt?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "version_snapshots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
