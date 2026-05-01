import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import LoginForm from "./components/LoginForm";
import MFAVerification from "./components/MFAVerification";
import CompanyBranding from "./components/CompanyBranding";
import Icon from "../../components/AppIcon";
import { useAuth } from "../../contexts/AuthContext";

const Login = () => {
  const navigate = useNavigate();
  const { signIn, user, userProfile, loading } = useAuth();

  const [currentStep, setCurrentStep] = useState("login");
  const [isLoading, setIsLoading] = useState(false);
  const [loginData, setLoginData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user && !loading && userProfile) {
      navigate(
        userProfile.role === "admin" ? "/admin-dashboard" : "/company-dashboard"
      );
    }
  }, [user, userProfile, loading, navigate]);

  const handleLogin = async (formData) => {
    setIsLoading(true);
    setError("");

    try {
      const { error } = await signIn(formData.email, formData.password);

      if (error) {
        setError(error.message || "Authentication failed");
        return;
      }

      setLoginData(formData);

      if (formData.company) {
        localStorage.setItem("selectedCompany", formData.company);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Icon
          name="Loader2"
          size={28}
          className="animate-spin text-muted-foreground"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      {/* LEFT — BRAND / TEXT */}
      <div className="hidden lg:flex items-center justify-center bg-muted/40 px-16">
        <div className="max-w-sm space-y-6">
          <CompanyBranding selectedCompany={loginData?.company} />
        </div>
      </div>

      {/* RIGHT — LOGIN */}
      <div className="flex items-center justify-center px-6 py-12 bg-background">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile branding */}
          <div className="lg:hidden text-center">
            <CompanyBranding selectedCompany={loginData?.company} />
          </div>

          <div className="bg-card border border-border rounded-lg p-6 lg:p-8">
            {currentStep === "login" ? (
              <div className="space-y-6">
                <h1 className="text-xl font-medium text-center text-foreground">
                  Sign in
                </h1>

                {error && (
                  <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <LoginForm onLogin={handleLogin} isLoading={isLoading} />
              </div>
            ) : (
              <MFAVerification />
            )}
          </div>

          <div className="text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} JASCO Group
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
