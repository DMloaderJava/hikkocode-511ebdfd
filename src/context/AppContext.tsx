import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export interface GeneratedFile {
  name: string;
  path: string;
  content: string;
  language: string;
}

export interface TaskStep {
  id: string;
  label: string;
  status: "pending" | "in_progress" | "done";
}

export interface GenerationTask {
  id: string;
  title: string;
  steps: TaskStep[];
  filesChanged: string[];
  toolCount: number;
  timestamp: Date;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  task?: GenerationTask;
}

export interface VersionSnapshot {
  id: string;
  version: number;
  files: GeneratedFile[];
  prompt: string;
  timestamp: Date;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  messages: ChatMessage[];
  files: GeneratedFile[];
  createdAt: Date;
  version: number;
  history: VersionSnapshot[];
}

interface AppState {
  projects: Project[];
  activeProject: Project | null;
  isGenerating: boolean;
  loadingMessage: string;
  activeFile: GeneratedFile | null;
  user: User | null;
  authLoading: boolean;
}

interface AppContextType extends AppState {
  createProject: (name: string, description: string) => Promise<Project>;
  setActiveProject: (project: Project) => void;
  setActiveFile: (file: GeneratedFile | null) => void;
  addMessage: (projectId: string, message: ChatMessage) => void;
  setFiles: (projectId: string, files: GeneratedFile[], prompt?: string) => void;
  setIsGenerating: (v: boolean) => void;
  setLoadingMessage: (msg: string) => void;
  restoreVersion: (projectId: string, versionId: string) => void;
  updateLastAssistantMessage: (projectId: string, content: string) => void;
  updateLastAssistantTask: (projectId: string, task: GenerationTask) => void;
  persistAssistantMessage: (projectId: string, messageId: string, content: string) => void;
  signOut: () => Promise<void>;
  loadProjects: () => Promise<void>;
}

export const funnyLoadingMessages = [
  "🎨 Crafting the UI layout...",
  "🧠 Analyzing your requirements...",
  "⚡ Writing JavaScript logic...",
  "☕ Brewing fresh CSS styles...",
  "🐛 Pre-checking for bugs...",
  "🎭 Optimizing for responsiveness...",
  "🌈 Applying design tokens...",
  "🏗️ Assembling components...",
  "📐 Perfecting the layout grid...",
  "🧙 Generating clean code...",
  "💅 Polishing the interface...",
  "🚀 Almost ready to preview...",
  "🔧 Wiring up event handlers...",
  "📦 Bundling everything together...",
  "✨ Adding finishing touches...",
];

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    projects: [],
    activeProject: null,
    isGenerating: false,
    loadingMessage: "",
    activeFile: null,
    user: null,
    authLoading: true,
  });

  const projectsLoadedRef = useRef(false);
  const userRef = useRef<User | null>(null);

  // Keep userRef in sync
  useEffect(() => {
    userRef.current = state.user;
  }, [state.user]);

  // Auth listener
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(prev => ({ ...prev, user: session?.user ?? null, authLoading: false }));
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setState(prev => ({ ...prev, user: session?.user ?? null, authLoading: false }));
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    projectsLoadedRef.current = false;
    setState(prev => ({ ...prev, user: null, projects: [], activeProject: null, activeFile: null }));
  }, []);

  const loadProjects = useCallback(async () => {
    const user = userRef.current;
    if (!user) return;

    const { data: projectRows } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (!projectRows) return;

    const projects: Project[] = [];

    for (const row of projectRows) {
      const [{ data: fileRows }, { data: msgRows }] = await Promise.all([
        supabase.from("project_files").select("*").eq("project_id", row.id),
        supabase.from("chat_messages").select("*").eq("project_id", row.id).order("created_at", { ascending: true }),
      ]);

      projects.push({
        id: row.id,
        name: row.name,
        description: row.description || "",
        version: row.version,
        createdAt: new Date(row.created_at),
        files: (fileRows || []).map(f => ({
          name: f.name,
          path: f.path,
          language: f.language,
          content: f.content,
        })),
        // Filter out empty assistant messages (from task card stubs)
        messages: (msgRows || [])
          .filter(m => m.content && m.content.trim().length > 0)
          .map(m => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: new Date(m.created_at),
          })),
        history: [],
      });
    }

    setState(prev => ({ ...prev, projects }));
  }, []);

  // Load projects when user logs in (only once per session)
  useEffect(() => {
    if (state.user && !projectsLoadedRef.current) {
      projectsLoadedRef.current = true;
      loadProjects();
    }
    if (!state.user) {
      projectsLoadedRef.current = false;
    }
  }, [state.user, loadProjects]);

  const createProject = useCallback(async (name: string, description: string) => {
    const user = userRef.current;
    if (user) {
      const { data, error } = await supabase
        .from("projects")
        .insert({ name, description, user_id: user.id })
        .select()
        .single();

      if (error) throw error;

      const project: Project = {
        id: data.id,
        name: data.name,
        description: data.description || "",
        messages: [],
        files: [],
        createdAt: new Date(data.created_at),
        version: 0,
        history: [],
      };

      setState(prev => ({
        ...prev,
        projects: [project, ...prev.projects],
        activeProject: project,
        activeFile: null,
      }));
      return project;
    }

    // Fallback: local-only
    const project: Project = {
      id: crypto.randomUUID(),
      name,
      description,
      messages: [],
      files: [],
      createdAt: new Date(),
      version: 0,
      history: [],
    };
    setState(prev => ({
      ...prev,
      projects: [project, ...prev.projects],
      activeProject: project,
      activeFile: null,
    }));
    return project;
  }, []);

  const setActiveProject = useCallback((project: Project) => {
    setState(prev => ({ ...prev, activeProject: project, activeFile: null }));
  }, []);

  const setActiveFile = useCallback((file: GeneratedFile | null) => {
    setState(prev => ({ ...prev, activeFile: file }));
  }, []);

  const addMessage = useCallback((projectId: string, message: ChatMessage) => {
    // Only save to DB if message has actual content
    const user = userRef.current;
    if (user && message.content && message.content.trim().length > 0) {
      supabase
        .from("chat_messages")
        .insert({
          id: message.id,
          project_id: projectId,
          role: message.role,
          content: message.content,
        })
        .then();
    }

    setState(prev => {
      const projects = prev.projects.map(p =>
        p.id === projectId ? { ...p, messages: [...p.messages, message] } : p
      );
      const activeProject = prev.activeProject?.id === projectId
        ? { ...prev.activeProject, messages: [...prev.activeProject.messages, message] }
        : prev.activeProject;
      return { ...prev, projects, activeProject };
    });
  }, []);

  const updateLastAssistantMessage = useCallback((projectId: string, content: string) => {
    setState(prev => {
      const updateMessages = (messages: ChatMessage[]) => {
        const lastIdx = messages.length - 1;
        if (lastIdx >= 0 && messages[lastIdx].role === "assistant") {
          return messages.map((m, i) => i === lastIdx ? { ...m, content } : m);
        }
        return [...messages, { id: crypto.randomUUID(), role: "assistant" as const, content, timestamp: new Date() }];
      };

      const projects = prev.projects.map(p =>
        p.id === projectId ? { ...p, messages: updateMessages(p.messages) } : p
      );
      const activeProject = prev.activeProject?.id === projectId
        ? { ...prev.activeProject, messages: updateMessages(prev.activeProject.messages) }
        : prev.activeProject;
      return { ...prev, projects, activeProject };
    });
  }, []);

  const updateLastAssistantTask = useCallback((projectId: string, task: GenerationTask) => {
    setState(prev => {
      const updateMessages = (messages: ChatMessage[]) => {
        const lastIdx = messages.length - 1;
        if (lastIdx >= 0 && messages[lastIdx].role === "assistant") {
          return messages.map((m, i) => i === lastIdx ? { ...m, task } : m);
        }
        return messages;
      };

      const projects = prev.projects.map(p =>
        p.id === projectId ? { ...p, messages: updateMessages(p.messages) } : p
      );
      const activeProject = prev.activeProject?.id === projectId
        ? { ...prev.activeProject, messages: updateMessages(prev.activeProject.messages) }
        : prev.activeProject;
      return { ...prev, projects, activeProject };
    });
  }, []);

  // Persist final assistant message content to DB (upsert)
  const persistAssistantMessage = useCallback((projectId: string, messageId: string, content: string) => {
    const user = userRef.current;
    if (!user || !content.trim()) return;

    supabase
      .from("chat_messages")
      .upsert({
        id: messageId,
        project_id: projectId,
        role: "assistant",
        content: content,
      })
      .then();
  }, []);

  const setFiles = useCallback((projectId: string, files: GeneratedFile[], prompt?: string) => {
    const user = userRef.current;
    if (user) {
      // Delete old files and insert new ones
      supabase
        .from("project_files")
        .delete()
        .eq("project_id", projectId)
        .then(() => {
          supabase
            .from("project_files")
            .insert(files.map(f => ({
              project_id: projectId,
              name: f.name,
              path: f.path,
              language: f.language,
              content: f.content,
            })))
            .then();
        });
    }

    setState(prev => {
      const updateProject = (p: Project): Project => {
        // Update version in DB
        const newVersion = p.version + 1;
        if (user) {
          supabase
            .from("projects")
            .update({ version: newVersion, updated_at: new Date().toISOString() })
            .eq("id", projectId)
            .then();
        }

        const snapshot: VersionSnapshot = {
          id: crypto.randomUUID(),
          version: p.version,
          files: p.files,
          prompt: prompt || "Unknown change",
          timestamp: new Date(),
        };
        const newHistory = p.files.length > 0 ? [...p.history, snapshot] : p.history;
        return { ...p, files, version: newVersion, history: newHistory };
      };

      const projects = prev.projects.map(p =>
        p.id === projectId ? updateProject(p) : p
      );
      const activeProject = prev.activeProject?.id === projectId
        ? updateProject(prev.activeProject)
        : prev.activeProject;
      return { ...prev, projects, activeProject };
    });
  }, []);

  const restoreVersion = useCallback((projectId: string, versionId: string) => {
    setState(prev => {
      const restoreInProject = (p: Project): Project => {
        const snapshot = p.history.find(h => h.id === versionId);
        if (!snapshot) return p;
        const currentSnapshot: VersionSnapshot = {
          id: crypto.randomUUID(),
          version: p.version,
          files: p.files,
          prompt: `Before restoring to v${snapshot.version}`,
          timestamp: new Date(),
        };
        return {
          ...p,
          files: snapshot.files,
          version: p.version + 1,
          history: [...p.history, currentSnapshot],
        };
      };

      const projects = prev.projects.map(p =>
        p.id === projectId ? restoreInProject(p) : p
      );
      const activeProject = prev.activeProject?.id === projectId
        ? restoreInProject(prev.activeProject)
        : prev.activeProject;
      return { ...prev, projects, activeProject };
    });
  }, []);

  const setIsGenerating = useCallback((v: boolean) => {
    setState(prev => ({ ...prev, isGenerating: v }));
  }, []);

  const setLoadingMessage = useCallback((msg: string) => {
    setState(prev => ({ ...prev, loadingMessage: msg }));
  }, []);

  return (
    <AppContext.Provider value={{
      ...state,
      createProject,
      setActiveProject,
      setActiveFile,
      addMessage,
      setFiles,
      setIsGenerating,
      setLoadingMessage,
      restoreVersion,
      updateLastAssistantMessage,
      updateLastAssistantTask,
      persistAssistantMessage,
      signOut,
      loadProjects,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be inside AppProvider");
  return ctx;
}
