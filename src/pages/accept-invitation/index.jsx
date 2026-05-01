import React, { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Icon from "../../components/AppIcon";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { supabase } from "../../lib/supabase";

const AcceptInvitation = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isValidToken, setIsValidToken] = useState(false);
  const [isCheckingToken, setIsCheckingToken] = useState(true);
  const [invitation, setInvitation] = useState(null);

  useEffect(() => {
    if (token) {
      verifyToken();
    } else {
      setIsCheckingToken(false);
    }
  }, [token]);

  const verifyToken = async () => {
    try {
      // Check if the invitation token is valid and not expired
      const { data, error } = await supabase
        .from("user_invitations")
        .select(`
          id,
          email,
          full_name,
          role,
          status,
          expires_at,
          supervisor_id,
          company:companies(id, name)
        `)
        .eq("token", token)
        .eq("status", "pending")
        .single();

      if (error || !data) {
        console.error("Token verification error:", error);
        setIsValidToken(false);
        setIsCheckingToken(false);
        return;
      }

      // Check if expired
      if (new Date(data.expires_at) < new Date()) {
        setIsValidToken(false);
        setIsCheckingToken(false);
        return;
      }

      setInvitation(data);
      setIsValidToken(true);
    } catch (err) {
      console.error("Error verifying token:", err);
      setIsValidToken(false);
    } finally {
      setIsCheckingToken(false);
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
    } else if (!/(?=.*[a-z])/.test(formData.password)) {
      newErrors.password = "Password must contain at least one lowercase letter";
    } else if (!/(?=.*[A-Z])/.test(formData.password)) {
      newErrors.password = "Password must contain at least one uppercase letter";
    } else if (!/(?=.*\d)/.test(formData.password)) {
      newErrors.password = "Password must contain at least one number";
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = "Please confirm your password";
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);

    try {
      // Sign up the user with Supabase Auth
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: invitation.email,
        password: formData.password,
        options: {
          data: {
            full_name: invitation.full_name,
          },
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      // Wait a moment for the trigger to create the user record
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Update the user record with invitation details (role, company, supervisor)
      if (authData.user) {
        const { error: updateUserError } = await supabase
          .from("users")
          .update({
            role: invitation.role,
            company_id: invitation.company?.id,
            supervisor_id: invitation.supervisor_id || null,
            full_name: invitation.full_name,
          })
          .eq("id", authData.user.id);

        if (updateUserError) {
          console.error("Error updating user profile:", updateUserError);
        }
      }

      // Update the invitation status to accepted
      const { error: updateError } = await supabase
        .from("user_invitations")
        .update({ status: "accepted" })
        .eq("id", invitation.id);

      if (updateError) {
        console.error("Error updating invitation status:", updateError);
      }

      setIsSuccess(true);

      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate("/login");
      }, 3000);
    } catch (err) {
      console.error("Account creation error:", err);
      setErrors({
        submit: err.message || "Failed to create account. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  // Loading state while checking token
  if (isCheckingToken) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Verifying your invitation...</p>
        </div>
      </div>
    );
  }

  // Invalid or expired invitation
  if (!isValidToken && !isCheckingToken) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
              <Icon name="AlertTriangle" size={32} className="text-red-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Invalid or Expired Invitation
            </h2>
            <p className="text-gray-600 mb-6">
              This invitation link is invalid or has expired. Please contact your administrator for a new invitation.
            </p>
            <Link to="/login">
              <Button variant="primary" className="w-full" leftIcon="ArrowLeft">
                Back to Login
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
              <Icon name="CheckCircle" size={32} className="text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Account Created Successfully!
            </h2>
            <p className="text-gray-600 mb-4">
              Welcome to {invitation.company?.name}! Your account has been set up.
            </p>
            <p className="text-sm text-gray-500">
              Redirecting you to login...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Icon name="UserPlus" size={32} className="text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Accept Invitation</h1>
          <p className="text-gray-600 mt-2">
            Set up your account to join {invitation?.company?.name}
          </p>
        </div>

        {/* Invitation Details Card */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <Icon name="Info" size={20} className="text-blue-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-900">Invitation Details</p>
              <div className="mt-2 space-y-1 text-sm text-blue-800">
                <p><strong>Name:</strong> {invitation?.full_name || "-"}</p>
                <p><strong>Email:</strong> {invitation?.email}</p>
                <p><strong>Role:</strong> <span className="capitalize">{invitation?.role}</span></p>
                <p><strong>Company:</strong> {invitation?.company?.name}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Error Alert */}
          {errors.submit && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <Icon name="AlertCircle" className="text-red-500 mt-0.5" size={20} />
              <div>
                <p className="text-sm font-medium text-red-800">Error</p>
                <p className="text-sm text-red-600">{errors.submit}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Create Password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Enter your password"
                  error={errors.password}
                  leftIcon="Lock"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <Icon name={showPassword ? "EyeOff" : "Eye"} size={20} />
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-sm text-red-500">{errors.password}</p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Confirm Password
              </label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="Confirm your password"
                  error={errors.confirmPassword}
                  leftIcon="Lock"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <Icon name={showConfirmPassword ? "EyeOff" : "Eye"} size={20} />
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="mt-1 text-sm text-red-500">{errors.confirmPassword}</p>
              )}
            </div>

            {/* Password Requirements */}
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-700 mb-2">
                Password must contain:
              </p>
              <ul className="text-sm text-gray-600 space-y-1">
                <li className="flex items-center gap-2">
                  <Icon
                    name={formData.password.length >= 8 ? "Check" : "X"}
                    size={14}
                    className={formData.password.length >= 8 ? "text-green-500" : "text-gray-400"}
                  />
                  At least 8 characters
                </li>
                <li className="flex items-center gap-2">
                  <Icon
                    name={/[A-Z]/.test(formData.password) ? "Check" : "X"}
                    size={14}
                    className={/[A-Z]/.test(formData.password) ? "text-green-500" : "text-gray-400"}
                  />
                  One uppercase letter
                </li>
                <li className="flex items-center gap-2">
                  <Icon
                    name={/[a-z]/.test(formData.password) ? "Check" : "X"}
                    size={14}
                    className={/[a-z]/.test(formData.password) ? "text-green-500" : "text-gray-400"}
                  />
                  One lowercase letter
                </li>
                <li className="flex items-center gap-2">
                  <Icon
                    name={/\d/.test(formData.password) ? "Check" : "X"}
                    size={14}
                    className={/\d/.test(formData.password) ? "text-green-500" : "text-gray-400"}
                  />
                  One number
                </li>
              </ul>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Icon name="Loader2" className="animate-spin mr-2" size={20} />
                  Creating Account...
                </>
              ) : (
                <>
                  <Icon name="UserPlus" className="mr-2" size={20} />
                  Create Account
                </>
              )}
            </Button>
          </form>

          {/* Back to login link */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{" "}
              <Link to="/login" className="text-primary hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AcceptInvitation;
