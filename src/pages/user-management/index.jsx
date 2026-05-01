import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import Header from "../../components/ui/Header";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Select from "../../components/ui/Select";
import Icon from "../../components/AppIcon";
import UserModal from "./components/UserModal";
import UserTable from "./components/UserTable";
import UserStats from "./components/UserStats";
import { userService } from "../../services/supabaseService";

const UserManagement = () => {
  const { user, userProfile, company } = useAuth();
  const navigate = useNavigate();

  // State management
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal state
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [modalMode, setModalMode] = useState("create"); // create, edit, view

  // Filter state
  const [filters, setFilters] = useState({
    search: "",
    role: "",
    status: "",
    sortBy: "created_at",
    sortOrder: "desc",
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [usersPerPage] = useState(10);

  // Check if user has permission to manage users (use userProfile for role)
  console.log("Auth user:", user);
  console.log("User profile:", userProfile);
  const canManageUsers =
    userProfile?.role === "admin" || 
    userProfile?.role === "director" || 
    userProfile?.role === "head" || 
    userProfile?.role === "manager";

  useEffect(() => {
    console.log("Can manage users:", canManageUsers);
    console.log("UserProfile role:", userProfile?.role);

    // Only check permissions if userProfile is loaded
    if (userProfile && !canManageUsers) {
      navigate("/company-dashboard");
      return;
    }

    if (company?.id && userProfile) {
      loadUsers();
    }
  }, [company?.id, userProfile, canManageUsers, navigate]);

  useEffect(() => {
    // Apply filters whenever users or filters change
    applyFilters();
  }, [users, filters]);

  const loadUsers = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error } = await userService.getCompanyUsers(
        company.id,
        filters
      );

      if (error) {
        setError("Failed to load users");
        console.error("Error loading users:", error);
      } else {
        setUsers(data || []);
      }
    } catch (err) {
      setError("Failed to load users");
      console.error("Error loading users:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...users];

    // Search filter
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      filtered = filtered.filter(
        (user) =>
          user.full_name?.toLowerCase().includes(searchTerm) ||
          user.email?.toLowerCase().includes(searchTerm)
      );
    }

    // Role filter
    if (filters.role) {
      filtered = filtered.filter((user) => user.role === filters.role);
    }

    // Status filter
    if (filters.status) {
      const isActive = filters.status === "active";
      filtered = filtered.filter((user) => user.is_active === isActive);
    }

    // Sorting
    filtered.sort((a, b) => {
      let aValue = a[filters.sortBy];
      let bValue = b[filters.sortBy];

      if (filters.sortBy === "created_at") {
        aValue = new Date(aValue);
        bValue = new Date(bValue);
      }

      if (filters.sortOrder === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    setFilteredUsers(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  };

  const handleCreateUser = () => {
    setSelectedUser(null);
    setModalMode("create");
    setIsUserModalOpen(true);
  };

  const handleEditUser = (user) => {
    setSelectedUser(user);
    setModalMode("edit");
    setIsUserModalOpen(true);
  };

  const handleViewUser = (user) => {
    setSelectedUser(user);
    setModalMode("view");
    setIsUserModalOpen(true);
  };

  const handleDeleteUser = async (userId) => {
    if (
      !confirm(
        "Are you sure you want to delete this user? This action cannot be undone."
      )
    ) {
      return;
    }

    try {
      const { error } = await userService.deleteUser(userId);

      if (error) {
        setError("Failed to delete user");
        console.error("Error deleting user:", error);
      } else {
        // Reload users after successful deletion
        await loadUsers();
      }
    } catch (err) {
      setError("Failed to delete user");
      console.error("Error deleting user:", err);
    }
  };

  const handleToggleUserStatus = async (userId, currentStatus) => {
    try {
      const { error } = await userService.updateUser(userId, {
        is_active: !currentStatus,
      });

      if (error) {
        setError("Failed to update user status");
        console.error("Error updating user status:", error);
      } else {
        // Reload users after successful update
        await loadUsers();
      }
    } catch (err) {
      setError("Failed to update user status");
      console.error("Error updating user status:", err);
    }
  };

  const handleUpdateUserRole = async (userId, newRole) => {
    try {
      const { error } = await userService.updateUser(userId, {
        role: newRole,
      });

      if (error) {
        setError("Failed to update user role");
        console.error("Error updating user role:", error);
      } else {
        // Reload users after successful update
        await loadUsers();
      }
    } catch (err) {
      setError("Failed to update user role");
      console.error("Error updating user role:", err);
    }
  };

  const handleUserModalSave = async (userData) => {
    try {
      if (modalMode === "create") {
        const { error } = await userService.createUser({
          ...userData,
          company_id: company.id,
        });

        if (error) {
          setError("Failed to create user");
          console.error("Error creating user:", error);
          return;
        }
      } else if (modalMode === "edit") {
        const { error } = await userService.updateUser(
          selectedUser.id,
          userData
        );

        if (error) {
          setError("Failed to update user");
          console.error("Error updating user:", error);
          return;
        }
      }

      // Close modal and reload users
      setIsUserModalOpen(false);
      await loadUsers();
    } catch (err) {
      setError(`Failed to ${modalMode} user`);
      console.error(`Error ${modalMode} user:`, err);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const clearFilters = () => {
    setFilters({
      search: "",
      role: "",
      status: "",
      sortBy: "created_at",
      sortOrder: "desc",
    });
  };

  // Pagination logic
  const indexOfLastUser = currentPage * usersPerPage;
  const indexOfFirstUser = indexOfLastUser - usersPerPage;
  const currentUsers = filteredUsers.slice(indexOfFirstUser, indexOfLastUser);
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);

  const paginate = (pageNumber) => setCurrentPage(pageNumber);

  // Show loading while userProfile is being fetched
  if (!userProfile) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Icon
            name="Loader2"
            size={48}
            className="text-primary animate-spin mx-auto mb-4"
          />
          <h1 className="text-xl font-medium text-card-foreground">
            Loading...
          </h1>
        </div>
      </div>
    );
  }

  if (!canManageUsers) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Icon name="Shield" size={48} className="text-error mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-card-foreground mb-2">
            Access Denied
          </h1>
          <p className="text-muted-foreground">
            You don't have permission to access user management.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="container mx-auto px-4 py-6">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-card-foreground">
              User Management
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage your team members and their permissions
            </p>
          </div>

          <Button
            onClick={handleCreateUser}
            iconName="UserPlus"
            iconPosition="left"
            disabled={isLoading}
          >
            Add New User
          </Button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-error/10 border border-error/20 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <Icon
                name="AlertTriangle"
                size={20}
                className="text-error mr-2"
              />
              <span className="text-error font-medium">{error}</span>
            </div>
          </div>
        )}

        {/* User Stats */}
        <UserStats users={users} isLoading={isLoading} />

        {/* Filters */}
        <div className="bg-card rounded-lg border border-border p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-card-foreground">
              Filters & Search
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              iconName="X"
              iconPosition="left"
            >
              Clear Filters
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Input
              label="Search Users"
              placeholder="Search by name or email..."
              value={filters.search}
              onChange={(e) => handleFilterChange("search", e.target.value)}
              iconName="Search"
            />

            <Select
              label="Role"
              value={filters.role}
              onChange={(e) => handleFilterChange("role", e.target.value)}
              options={[
                { value: "", label: "All Roles" },
                { value: "admin", label: "Admin" },
                { value: "manager", label: "Manager" },
                { value: "agent", label: "Agent" },
              ]}
            />

            <Select
              label="Status"
              value={filters.status}
              onChange={(e) => handleFilterChange("status", e.target.value)}
              options={[
                { value: "", label: "All Status" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
            />

            <Select
              label="Sort By"
              value={filters.sortBy}
              onChange={(e) => handleFilterChange("sortBy", e.target.value)}
              options={[
                { value: "created_at", label: "Date Created" },
                { value: "full_name", label: "Name" },
                { value: "email", label: "Email" },
                { value: "role", label: "Role" },
              ]}
            />

            <Select
              label="Order"
              value={filters.sortOrder}
              onChange={(e) => handleFilterChange("sortOrder", e.target.value)}
              options={[
                { value: "desc", label: "Descending" },
                { value: "asc", label: "Ascending" },
              ]}
            />
          </div>
        </div>

        {/* User Table */}
        <UserTable
          users={currentUsers}
          isLoading={isLoading}
          onEdit={handleEditUser}
          onView={handleViewUser}
          onDelete={handleDeleteUser}
          onToggleStatus={handleToggleUserStatus}
          onUpdateRole={handleUpdateUserRole}
          currentUser={userProfile}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center mt-6">
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => paginate(currentPage - 1)}
                disabled={currentPage === 1}
                iconName="ChevronLeft"
              >
                Previous
              </Button>

              {[...Array(totalPages)].map((_, index) => {
                const pageNumber = index + 1;
                return (
                  <Button
                    key={pageNumber}
                    variant={currentPage === pageNumber ? "default" : "ghost"}
                    size="sm"
                    onClick={() => paginate(pageNumber)}
                  >
                    {pageNumber}
                  </Button>
                );
              })}

              <Button
                variant="ghost"
                size="sm"
                onClick={() => paginate(currentPage + 1)}
                disabled={currentPage === totalPages}
                iconName="ChevronRight"
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {/* User Modal */}
        <UserModal
          isOpen={isUserModalOpen}
          onClose={() => setIsUserModalOpen(false)}
          onSave={handleUserModalSave}
          user={selectedUser}
          mode={modalMode}
          currentUser={userProfile}
        />
      </div>
    </div>
  );
};

export default UserManagement;
