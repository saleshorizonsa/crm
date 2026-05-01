import React, { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { settingsService } from "../services/supabaseService";

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load user profile and currency settings
  const loadUserProfile = async (userId, retryCount = 0) => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000; // 1 second

    try {
      // Fetch profile first - this is required
      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select(
          `
          *,
          company:companies(*)
        `
        )
        .eq("id", userId)
        .single();

      if (profileError) {
        // Handle network errors with retry
        if (
          profileError.message?.includes("Load failed") ||
          profileError.message?.includes("NetworkError") ||
          profileError.message?.includes("Failed to fetch")
        ) {
          if (retryCount < MAX_RETRIES) {
            console.warn(
              `Network error, retrying (${retryCount + 1}/${MAX_RETRIES})...`
            );
            await new Promise((resolve) =>
              setTimeout(resolve, RETRY_DELAY * (retryCount + 1))
            );
            return loadUserProfile(userId, retryCount + 1);
          }
          console.error("Profile error after retries:", profileError);
          setLoading(false);
          return;
        }

        console.error("Profile error:", profileError);
        // If user doesn't exist in database, sign them out
        if (
          profileError.code === "PGRST116" ||
          profileError.message?.includes("no rows")
        ) {
          console.warn("User profile not found, signing out...");
          await supabase.auth.signOut();
          setUser(null);
          setUserProfile(null);
          setCompany(null);
          setLoading(false);
          return;
        }
        throw profileError;
      }

      if (!profile) {
        console.warn("No profile returned, signing out...");
        await supabase.auth.signOut();
        setUser(null);
        setUserProfile(null);
        setCompany(null);
        setLoading(false);
        return;
      }

      setUserProfile(profile);

      // For admin and director roles, they can work across all companies
      // For other roles, they must have a company assigned
      if (profile.role === "admin" || profile.role === "director") {
        // Check if there's a saved company selection in localStorage
        const savedCompanyId = localStorage.getItem("selectedCompanyId");

        if (savedCompanyId && savedCompanyId !== profile.company?.id) {
          // Load the saved company in parallel with settings
          const [companyResult, settingsResult] = await Promise.all([
            supabase
              .from("companies")
              .select("*")
              .eq("id", savedCompanyId)
              .single(),
            settingsService.getUserSettings(userId),
          ]);

          if (companyResult.data) {
            setCompany(companyResult.data);
          } else if (profile.company) {
            setCompany(profile.company);
          } else {
            // Load first available company
            const { data: companies } = await supabase
              .from("companies")
              .select("*")
              .order("name")
              .limit(1);
            if (companies?.[0]) setCompany(companies[0]);
          }

          // Handle settings
          if (
            !settingsResult.error &&
            settingsResult.data?.preferred_currency
          ) {
            localStorage.setItem(
              "preferredCurrency",
              settingsResult.data.preferred_currency
            );
          }
        } else if (profile.company) {
          setCompany(profile.company);
          // Load settings in background
          settingsService.getUserSettings(userId).then(({ data: settings }) => {
            if (settings?.preferred_currency) {
              localStorage.setItem(
                "preferredCurrency",
                settings.preferred_currency
              );
            }
          });
        } else {
          // Load first available company and settings in parallel
          const [companiesResult, settingsResult] = await Promise.all([
            supabase.from("companies").select("*").order("name").limit(1),
            settingsService.getUserSettings(userId),
          ]);

          if (companiesResult.data?.[0]) {
            setCompany(companiesResult.data[0]);
          }
          if (
            !settingsResult.error &&
            settingsResult.data?.preferred_currency
          ) {
            localStorage.setItem(
              "preferredCurrency",
              settingsResult.data.preferred_currency
            );
          }
        }
      } else {
        // Regular users - company is from profile, just load settings in background
        setCompany(profile.company);
        settingsService.getUserSettings(userId).then(({ data: settings }) => {
          if (settings?.preferred_currency) {
            localStorage.setItem(
              "preferredCurrency",
              settings.preferred_currency
            );
          }
        });
      }

      setLoading(false);
    } catch (error) {
      // Handle network errors - don't clear user state, just log and stop loading
      if (
        error?.message?.includes("Load failed") ||
        error?.message?.includes("NetworkError") ||
        error?.message?.includes("Failed to fetch") ||
        error instanceof TypeError
      ) {
        console.warn(
          "Network error loading profile, will retry on next action:",
          error?.message
        );
        setLoading(false);
        return;
      }

      console.error("Error loading user profile:", error);
      // If there's any other error loading profile, clear the state
      // The user might need to re-authenticate
      setUserProfile(null);
      setCompany(null);
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Events that should NOT trigger profile reload:
      // - TOKEN_REFRESHED: happens on browser refocus
      // - INITIAL_SESSION: handled by getSession() above
      // - USER_UPDATED: minor user updates
      if (
        event === "TOKEN_REFRESHED" ||
        event === "INITIAL_SESSION" ||
        event === "USER_UPDATED"
      ) {
        // Just update user without reloading profile
        if (session?.user) {
          setUser(session.user);
        }
        return;
      }

      // Only handle SIGNED_IN and SIGNED_OUT events
      if (event === "SIGNED_OUT") {
        setUser(null);
        setUserProfile(null);
        setCompany(null);
        setLoading(false);
        return;
      }

      // For SIGNED_IN, load the profile
      if (event === "SIGNED_IN" && session?.user) {
        setUser(session.user);
        // Only load profile if we don't already have one for this user
        if (!userProfile || userProfile.id !== session.user.id) {
          loadUserProfile(session.user.id);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []); // No dependencies - only run once

  const signIn = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error("Sign in error:", error);
      return { data: null, error };
    }
  };

  const signOut = async () => {
    try {
      // Try to sign out from Supabase, but don't throw if it fails
      // (session might already be expired/missing)
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) {
        console.warn("Supabase sign out warning:", error.message);
        // Continue with local cleanup even if Supabase signOut fails
      }
    } catch (error) {
      console.warn("Sign out warning:", error.message);
      // Continue with local cleanup even if there's an error
    }

    // Always clear local state regardless of Supabase signOut result
    setUser(null);
    setUserProfile(null);
    setCompany(null);

    // Clear localStorage - including Supabase auth keys
    localStorage.removeItem("preferredCurrency");
    localStorage.removeItem("selectedCompany");
    localStorage.removeItem("selectedCompanyId");

    // Clear all Supabase auth related keys from localStorage
    // This ensures session is fully cleared even if signOut API fails
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith("sb-") || key.includes("supabase"))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));

    navigate("/login");

    return { error: null };
  };

  // Allow admin/director to change company context
  const changeCompany = (newCompany) => {
    if (userProfile?.role === "admin" || userProfile?.role === "director") {
      setCompany(newCompany);
      // Optionally save to localStorage for persistence
      if (newCompany) {
        localStorage.setItem("selectedCompanyId", newCompany.id);
      }
    }
  };

  const value = {
    user,
    userProfile,
    company,
    loading,
    signIn,
    signOut,
    changeCompany,
    refetchProfile: () => user?.id && loadUserProfile(user.id),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
