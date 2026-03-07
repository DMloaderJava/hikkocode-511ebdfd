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

export interface Project {
  id: string;
  name: string;
  description: string;
  messages: ChatMessage[];
  files: GeneratedFile[];
  createdAt: Date;
  version: number;
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
  setFiles: (projectId: string, files: GeneratedFile[]) => void;
  setIsGenerating: (v: boolean) => void;
  setLoadingMessage: (msg: string) => void;
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
      version: 1,
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

  const setFiles = useCallback((projectId: string, files: GeneratedFile[]) => {
    setState(prev => {
      const projects = prev.projects.map(p =>
        p.id === projectId ? { ...p, files, version: p.version + 1 } : p
      );
      const activeProject = prev.activeProject?.id === projectId
        ? { ...prev.activeProject, files, version: prev.activeProject.version + 1 }
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
