import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import LoginForm from "./components/LoginForm";
import MFAVerification from "./components/MFAVerification";
import CompanyBranding from "./components/CompanyBranding";
import DailyQuote from "../../components/DailyQuote";
import Icon from "../../components/AppIcon";
import { useAuth } from "../../contexts/AuthContext";

// Public storage URLs — no DB query / no auth needed (companies table is RLS-blocked pre-login).
// Logos are publicly readable from the company-logos bucket; onError falls back to colored initials.
const SUPABASE_URL = "https://sywtvrfoexnvwpuiveag.supabase.co";
const logoUrl = (id) =>
  `${SUPABASE_URL}/storage/v1/object/public/company-logos/${id}/logo.png`;

const COMPANIES_WITH_LOGOS = [
  { id: "adf8ee78-cf78-4f02-932c-989a214bdd78", name: "JASCO PVC",     initials: "PVC", color: "#2563EB", bg: "#EFF6FF", logo_url: logoUrl("adf8ee78-cf78-4f02-932c-989a214bdd78") },
  { id: "0872a05a-6fa4-4aee-9aa2-10898e133e65", name: "JASCO Steels",  initials: "STL", color: "#475569", bg: "#F1F5F9", logo_url: logoUrl("0872a05a-6fa4-4aee-9aa2-10898e133e65") },
  { id: "271aa099-0f92-4185-a2a9-27e4fab5b1e8", name: "JASCO IMDADAT", initials: "IMD", color: "#0D9488", bg: "#F0FDFA", logo_url: logoUrl("271aa099-0f92-4185-a2a9-27e4fab5b1e8") },
  { id: "2524da2c-07e0-414d-9ceb-2adf83d92ca4", name: "JAECO",         initials: "JAE", color: "#7C3AED", bg: "#FAF5FF", logo_url: logoUrl("2524da2c-07e0-414d-9ceb-2adf83d92ca4") },
];

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

  // Direct public storage URLs — no auth / no DB read needed.
  // If a logo.png does not exist, onError swaps to the colored initials.
  const displayCompanies = COMPANIES_WITH_LOGOS;

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
      {/* LEFT — BRANDED PANEL */}
      <div className="hidden lg:block p-6">
        <div className="flex flex-col justify-between h-full min-h-[500px] p-8 rounded-2xl bg-gradient-to-br from-[#1E3A5F] to-[#2563EB]">
          {/* TOP — title */}
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">JASCO Group</h1>
            <p className="text-blue-200 text-sm">Your business intelligence platform</p>
          </div>

          {/* MIDDLE — 4 company logos grid */}
          <div className="grid grid-cols-2 gap-3 my-auto py-6">
            {displayCompanies.map((company) => (
              <div
                key={company.id}
                className="bg-white/10 rounded-xl p-4 flex flex-col items-center gap-2.5 border border-white/15 hover:bg-white/15 transition-colors"
              >
                {/* Logo image OR colored initials */}
                <div className="w-14 h-14 rounded-xl bg-white flex items-center justify-center overflow-hidden shadow-sm flex-shrink-0">
                  {company.logo_url ? (
                    <img
                      src={company.logo_url}
                      alt={company.name}
                      className="w-full h-full object-contain p-1.5"
                      onError={(e) => {
                        e.target.style.display = "none";
                        if (e.target.nextElementSibling)
                          e.target.nextElementSibling.style.display = "flex";
                      }}
                    />
                  ) : null}
                  <div
                    style={{
                      background: company.bg,
                      color: company.color,
                      display: company.logo_url ? "none" : "flex",
                    }}
                    className="w-full h-full items-center justify-center text-sm font-bold rounded-xl"
                  >
                    {company.initials}
                  </div>
                </div>

                {/* Company name */}
                <span className="text-xs font-medium text-white/80 text-center leading-tight">
                  {company.name.replace(/JASCO\s*/i, "")}
                </span>
              </div>
            ))}
          </div>

          {/* BOTTOM — Daily motivation quote */}
          <DailyQuote />
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
