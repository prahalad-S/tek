import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { client, configured } from "../lib/supabase";
import { rpc } from "../lib/api";
import { previewEmployees } from "../lib/preview";
import type { Employee, Member } from "../lib/types";
import { errorMessage } from "../lib/domain";
type AuthValue = {
  session: Session | null;
  profile: Employee | null;
  member: Member | null;
  loading: boolean;
  error: string;
  preview: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<AuthValue>(null!);
export function AuthProvider({
  children,
  preview = false,
}: {
  children: ReactNode;
  preview?: boolean;
}) {
  const requestEpoch = useRef(0);
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Employee | null>(
    preview ? previewEmployees[0] : null,
  );
  const [member, setMember] = useState<Member | null>(
    preview
      ? {
          user_id: "preview",
          role: "admin",
          active: true,
          department_id: "Design",
        }
      : null,
  );
  const [loading, setLoading] = useState(!preview && configured);
  const [error, setError] = useState("");
  async function refresh() {
    if (preview) return;
    const epoch = ++requestEpoch.current;
    setError("");
    try {
      await rpc("claim_profile");
      const {
        data: { user },
      } = await client().auth.getUser();
      if (!user) return;
      const [p, m] = await Promise.all([
        client()
          .from("employees")
          .select("*, departments(name)")
          .eq("user_id", user.id)
          .single(),
        client()
          .from("memberships")
          .select("*")
          .eq("user_id", user.id)
          .single(),
      ]);
      if (p.error) throw p.error;
      if (m.error) throw m.error;
      if (epoch === requestEpoch.current) {
        setProfile(p.data);
        setMember(m.data);
      }
    } catch (e) {
      if (epoch === requestEpoch.current) setError(errorMessage(e));
    } finally {
      if (epoch === requestEpoch.current) setLoading(false);
    }
  }
  useEffect(() => {
    if (preview || !configured) return;
    let active = true;
    client()
      .auth.getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setError(error.message);
        setSession(data.session);
        if (!data.session) setLoading(false);
      });
    const {
      data: { subscription },
    } = client().auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      if (!next) {
        requestEpoch.current++;
        setProfile(null);
        setMember(null);
        setLoading(false);
        queryClient.clear();
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [preview, queryClient]);
  useEffect(() => {
    if (session?.user.id) {
      setLoading(true);
      void refresh();
    }
  }, [session?.user.id]);
  async function signOut() {
    if (preview) {
      window.location.assign("/login");
      return;
    }
    const { error } = await client().auth.signOut();
    if (error) throw error;
    setProfile(null);
    setMember(null);
    queryClient.clear();
  }
  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        member,
        loading,
        error,
        preview,
        refresh,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
const ThemeContext = createContext<{
  theme: string;
  setTheme: (t: string) => void;
}>(null!);
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState(
    () => localStorage.getItem("symportal-theme") || "system",
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
    };
    apply();
    localStorage.setItem("symportal-theme", theme);
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
export const useTheme = () => useContext(ThemeContext);
