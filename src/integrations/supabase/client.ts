
// This file is a local mock of the Supabase client to remove dependency on the real Supabase service.
// It uses localStorage or memory to simulate database behavior.

export type Database = any;

const mockStorage: Record<string, any[]> = {
  projects: JSON.parse(localStorage.getItem("hikkocode_projects") || "[]"),
  chat_messages: [],
  project_files: [],
  version_snapshots: [],
  file_index: [],
};

const createMockBuilder = (table: string) => {
  const builder: any = {
    select: () => builder,
    insert: (data: any) => {
      const rows = Array.isArray(data) ? data : [data];
      mockStorage[table] = [...(mockStorage[table] || []), ...rows];
      return builder;
    },
    update: (data: any) => builder,
    delete: () => builder,
    eq: (column: string, value: any) => builder,
    or: (query: string) => builder,
    single: async () => ({ data: mockStorage[table]?.[0] || null, error: null }),
    order: () => builder,
    limit: (n: number) => builder,
    // Add then to make it awaitable
    then: (resolve: any) => resolve({ data: mockStorage[table] || [], error: null }),
  };
  return builder;
};

export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: { access_token: "mock-token" } }, error: null }),
    getUser: async () => ({ data: { user: { id: "mock-user-id", email: "user@example.com" } }, error: null }),
    signInWithPassword: async () => ({ data: { user: { id: "mock-user-id" } }, error: null }),
    signUp: async () => ({ data: { user: { id: "mock-user-id" } }, error: null }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: (callback: any) => {
      callback("SIGNED_IN", { user: { id: "mock-user-id" } });
      return { data: { subscription: { unsubscribe: () => {} } } };
    },
  },
  from: (table: string) => createMockBuilder(table),
  functions: {
    invoke: async (name: string, options?: any) => {
      console.log(`Mock function invoke: ${name}`, options);
      if (name === "github") {
        return { data: { success: true, url: "https://github.com/mock/repo" }, error: null };
      }
      return { data: {}, error: null };
    },
  },
  channel: (name: string) => ({
    on: () => ({ subscribe: () => {} }),
    subscribe: () => {},
  }),
  removeChannel: (channel: any) => {},
};
