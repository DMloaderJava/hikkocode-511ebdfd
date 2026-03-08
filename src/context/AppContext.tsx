import { createContext, useContext, useState, ReactNode, useCallback } from "react";

export interface GeneratedFile {
  name: string;
  path: string;
  content: string;
  language: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
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
}

interface AppContextType extends AppState {
  createProject: (name: string, description: string) => Project;
  setActiveProject: (project: Project) => void;
  setActiveFile: (file: GeneratedFile | null) => void;
  addMessage: (projectId: string, message: ChatMessage) => void;
  setFiles: (projectId: string, files: GeneratedFile[], prompt?: string) => void;
  setIsGenerating: (v: boolean) => void;
  setLoadingMessage: (msg: string) => void;
  restoreVersion: (projectId: string, versionId: string) => void;
  updateLastAssistantMessage: (projectId: string, content: string) => void;
}

const funnyLoadingMessages = [
  "🎨 Convincing CSS to align divs...",
  "🧠 Teaching AI what flexbox means...",
  "🔮 Consulting the Stack Overflow oracle...",
  "☕ Brewing artisanal JavaScript...",
  "🐛 Pre-debugging your bugs...",
  "🎭 Negotiating with TypeScript compiler...",
  "🌈 Adding just the right amount of border-radius...",
  "🏗️ Building with digital Legos...",
  "🤖 AI is having an existential crisis about semicolons...",
  "📐 Measuring pixels with a ruler...",
  "🎪 Training hamsters to run the dev server...",
  "🧙 Casting `npm install` spell...",
  "🍕 Ordering pizza for the deployment team...",
  "💅 Applying final coat of CSS polish...",
  "🚀 Strapping rockets to your divs...",
];

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    projects: [],
    activeProject: null,
    isGenerating: false,
    loadingMessage: "",
    activeFile: null,
  });

  const createProject = useCallback((name: string, description: string) => {
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
      projects: [...prev.projects, project],
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

  const setFiles = useCallback((projectId: string, files: GeneratedFile[], prompt?: string) => {
    setState(prev => {
      const updateProject = (p: Project): Project => {
        // Save current version to history before overwriting
        const snapshot: VersionSnapshot = {
          id: crypto.randomUUID(),
          version: p.version,
          files: p.files,
          prompt: prompt || "Unknown change",
          timestamp: new Date(),
        };
        const newHistory = p.files.length > 0 ? [...p.history, snapshot] : p.history;
        return { ...p, files, version: p.version + 1, history: newHistory };
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
        // Save current as a snapshot too
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

export { funnyLoadingMessages };
