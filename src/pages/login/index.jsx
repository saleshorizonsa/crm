import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import LoginForm from "./components/LoginForm";
import MFAVerification from "./components/MFAVerification";
import CompanyBranding from "./components/CompanyBranding";
import DailyQuote from "../../components/DailyQuote";
import Icon from "../../components/AppIcon";
import { useAuth } from "../../contexts/AuthContext";
import { logoService } from "../../services/supabaseService";
import { supabase } from "../../lib/supabase";

const Login = () => {
  const navigate = useNavigate();
  const { signIn, user, userProfile, loading } = useAuth();

  const [currentStep, setCurrentStep] = useState("login");
  const [isLoading, setIsLoading] = useState(false);
  const [loginData, setLoginData] = useState(null);
  const [error, setError] = useState("");
  const [companyLogos, setCompanyLogos] = useState([]);

  useEffect(() => {
    if (user && !loading && userProfile) {
      navigate(
        userProfile.role === "admin" ? "/admin-dashboard" : "/company-dashboard"
      );
    }
  }, [user, userProfile, loading, navigate]);

  useEffect(() => {
    loadCompanyLogos();
  }, []);

  async function loadCompanyLogos() {
    const companyIds = [
      "adf8ee78-cf78-4f02-932c-989a214bdd78",
      "0872a05a-6fa4-4aee-9aa2-10898e133e65",
      "271aa099-0f92-4185-a2a9-27e4fab5b1e8",
      "2524da2c-07e0-414d-9ceb-2adf83d92ca4",
    ];
    try {
      const { data } = await logoService.getCompanyLogos(companyIds);
      if (data && data.length > 0) {
        setCompanyLogos(data);
        return;
      }
      // Fallback: load all companies if the specific IDs return nothing
      const { data: all } = await supabase
        .from("companies")
        .select("id, name, logo_url, primary_color, tagline")
        .order("name")
        .limit(4);
      setCompanyLogos(all || []);
    } catch {
      /* pre-auth read may be blocked — grid simply stays empty */
    }
  }

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
        <div className="flex flex-col justify-between h-full p-10 rounded-2xl bg-gradient-to-br from-[#1E3A5F] to-[#2563EB]">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">JASCO Group</h1>
            <p className="text-blue-200 text-sm">Your business intelligence platform</p>
          </div>

          {/* 4 Company logos grid */}
          <div className="grid grid-cols-2 gap-3">
            {companyLogos.map((company) => {
              const initials = (company.name || "")
                .replace(/JASCO\s*/i, "")
                .slice(0, 3)
                .toUpperCase() || "CO";
              return (
                <div
                  key={company.id}
                  className="bg-white/10 rounded-xl p-3 flex flex-col items-center gap-2 border border-white/10 hover:bg-white/15 transition-colors"
                >
                  <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center overflow-hidden">
                    {company.logo_url ? (
                      <img
                        src={company.logo_url}
                        alt={company.name}
                        className="w-full h-full object-contain p-1"
                        onError={(e) => {
                          e.target.style.display = "none";
                          if (e.target.nextSibling) e.target.nextSibling.style.display = "flex";
                        }}
                      />
                    ) : null}
                    <span
                      className="text-xs font-bold text-[#1E3A5F] items-center justify-center w-full h-full"
                      style={{ display: company.logo_url ? "none" : "flex" }}
                    >
                      {initials}
                    </span>
                  </div>
                  <span className="text-xs font-medium text-white/80 text-center leading-tight">
                    {(company.name || "").replace(/JASCO\s*/i, "") || company.name}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Daily motivation quote */}
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
