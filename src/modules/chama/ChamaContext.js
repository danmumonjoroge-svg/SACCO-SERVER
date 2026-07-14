import React, {
  createContext,
  useContext,
  useState,
  useMemo,
} from "react";

export const ChamaContext = createContext(null);

export function ChamaProvider({ children }) {
  const [chama, setChama] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("chama")) || null;
    } catch {
      return null;
    }
  });

  const [member, setMember] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("chama_member")) || null;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState(false);

  // Authentication
  const login = ({ chamaData, memberData }) => {
    setChama(chamaData);
    setMember(memberData);

    localStorage.setItem(
      "chama",
      JSON.stringify(chamaData)
    );

    localStorage.setItem(
      "chama_member",
      JSON.stringify(memberData)
    );
  };

  const logout = () => {
    setChama(null);
    setMember(null);

    localStorage.removeItem("chama");
    localStorage.removeItem("chama_member");
    localStorage.removeItem("auth_token");
  };

  // Authorization
  const hasRole = (roles) => {
    if (!member?.role) return false;

    if (
      member.role?.toLowerCase() === "chairman" ||
      member.role?.toLowerCase() === "admin"
    ) {
      return true;
    }

    if (Array.isArray(roles)) {
      return roles.includes(member.role);
    }

    return member.role === roles;
  };

  // API helper
  const api = useMemo(
    () => ({
      request: async (
        endpoint,
        options = {}
      ) => {
        const token =
          localStorage.getItem("auth_token");

        const headers = {
          "Content-Type": "application/json",
          "x-chama-no": chama?.chama_no || "",
          "x-member-no": member?.member_no || "",
          ...(token && {
            Authorization: `Bearer ${token}`,
          }),
        };

        const response = await fetch(
          `${process.env.REACT_APP_API_URL}${endpoint}`,
          {
            ...options,
            headers: {
              ...headers,
              ...options.headers,
            },
          }
        );

        if (!response.ok) {
          throw new Error(
            `API Error ${response.status}`
          );
        }

        return response.json();
      },
    }),
    [chama, member]
  );

  const refreshMemberData = async () => {
    if (!member?.id) return;

    try {
      const updated = await api.request(
        `/members/${member.id}`
      );

      setMember(updated);

      localStorage.setItem(
        "chama_member",
        JSON.stringify(updated)
      );
    } catch (error) {
      console.error(
        "Refresh member failed:",
        error
      );
    }
  };

  const value = {
    chama,
    member,
    loading,
    setLoading,

    login,
    logout,

    hasRole,

    api,

    refreshMemberData,

    setChama,
    setMember,
  };

  return (
    <ChamaContext.Provider value={value}>
      {children}
    </ChamaContext.Provider>
  );
}

export function useChama() {
  const context = useContext(ChamaContext);

  if (!context) {
    throw new Error(
      "useChama must be used inside ChamaProvider"
    );
  }

  return context;
}

export default ChamaContext;