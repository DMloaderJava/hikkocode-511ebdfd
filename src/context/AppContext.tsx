import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";

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
  type?: "think" | "read" | "plan" | "edit" | "verify" | "analyze" | "create_file" | "add_styles" | "add_logic" | "add_component" | "configure" | "default";
  detail?: string;
  duration?: number;
  content?: string;
}

export interface GenerationTask {
  id: string;
  title: string;
  steps: TaskStep[];
  filesChanged: string[];
  toolCount: number;
  timestamp: Date;
  thinkingTime?: number;
  fileProgress?: { done: number; total: number };
  plan?: {
    analysis: string;
    approach: string;
    technologies?: string[];
    files_to_read?: string[];
    files_to_edit?: string[];
    new_files?: string[];
    planSteps?: string[];
  };
  diffs?: import("@/lib/diff").FileDiff[];
  diffSummary?: string;
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
  user: null; // No auth for GitHub Pages
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

// LocalStorage helpers
const STORAGE_KEY = "hikkocode_projects";

function loadProjectsFromStorage(): Project[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    
    const projects = JSON.parse(data) as any[];
    return projects.map(p => ({
      ...p,
      createdAt: new Date(p.createdAt),
      messages: p.messages.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })),
      history: p.history.map((h: any) => ({ ...h, timestamp: new Date(h.timestamp) })),
    }));
  } catch {
    return [];
  }
}

function saveProjectsToStorage(projects: Project[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    projects: loadProjectsFromStorage(),
    activeProject: null,
    isGenerating: false,
    loadingMessage: "",
    activeFile: null,
    user: null,
    authLoading: false,
  });

  const projectsLoadedRef = useRef(false);

  // Set initial active project
  useEffect(() => {
    if (!projectsLoadedRef.current && state.projects.length > 0) {
      projectsLoadedRef.current = true;
      setState(prev => ({
        ...prev,
        activeProject: prev.projects[0],
      }));
    }
  }, []);

  const loadProjects = useCallback(async () => {
    const projects = loadProjectsFromStorage();
    setState(prev => ({
      ...prev,
      projects,
      activeProject: prev.activeProject
        ? projects.find(p => p.id === prev.activeProject!.id) || projects[0] || null
        : projects[0] || null,
    }));
  }, []);

  const createProject = useCallback(async (name: string, description: string) => {
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

    setState(prev => {
      const newProjects = [project, ...prev.projects];
      saveProjectsToStorage(newProjects);
      return {
        ...prev,
        projects: newProjects,
        activeProject: project,
        activeFile: null,
      };
    });
    return project;
  }, []);

  const setActiveProject = useCallback((project: Project) => {
    setState(prev => ({ ...prev, activeProject: project, activeFile: null }));
  }, []);

  const setActiveFile = useCallback((file: GeneratedFile | null) => {
    setState(prev => ({ ...prev, activeFile: file }));
  }, []);

  const addMessage = useCallback((projectId: string, message: ChatMessage) => {
    setState(prev => {
      const projects = prev.projects.map(p =>
        p.id === projectId ? { ...p, messages: [...p.messages, message] } : p
      );
      saveProjectsToStorage(projects);

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
      saveProjectsToStorage(projects);

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
      saveProjectsToStorage(projects);

      const activeProject = prev.activeProject?.id === projectId
        ? { ...prev.activeProject, messages: updateMessages(prev.activeProject.messages) }
        : prev.activeProject;

      return { ...prev, projects, activeProject };
    });
  }, []);

  const persistAssistantMessage = useCallback((projectId: string, messageId: string, content: string) => {
    setState(prev => {
      const projects = prev.projects.map(p =>
        p.id === projectId
          ? {
              ...p,
              messages: p.messages.map(m =>
                m.id === messageId ? { ...m, content } : m
              ),
            }
          : p
      );
      saveProjectsToStorage(projects);
      return { ...prev, projects };
    });
  }, []);

  const setFiles = useCallback((projectId: string, files: GeneratedFile[], prompt?: string) => {
    setState(prev => {
      const updateProject = (p: Project): Project => {
        if (p.id !== projectId) return p;

        const newVersion = p.version + 1;
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
      saveProjectsToStorage(projects);

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
      saveProjectsToStorage(projects);

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

  const signOut = useCallback(async () => {
    // No-op for GitHub Pages (no auth)
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
