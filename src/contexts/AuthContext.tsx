import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

interface User {
    id: string;
    email: string;
    name: string;
    role: string;
}

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
    signup: (email: string, password: string, name: string) => Promise<{ success: boolean; error?: string }>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const MOCK_USER: User = {
    id: '1',
    email: 'admin@luera.com',
    name: 'Admin',
    role: 'Admin',
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const login = async (_email: string, _password: string) => ({ success: true });
    const signup = async (_email: string, _password: string, _name: string) => ({ success: true });
    const logout = async () => {};

    return (
        <AuthContext.Provider
            value={{
                user: MOCK_USER,
                isAuthenticated: true,
                isLoading: false,
                login,
                signup,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
