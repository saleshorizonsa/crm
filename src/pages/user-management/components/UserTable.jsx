import React, { useState } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import Select from "../../../components/ui/Select";

const UserTable = ({
  users,
  isLoading,
  onEdit,
  onView,
  onDelete,
  onToggleStatus,
  onUpdateRole,
  currentUser,
}) => {
  const [updatingUser, setUpdatingUser] = useState(null);

  const handleRoleChange = async (user, newRole) => {
    if (user.role === newRole) return;

    setUpdatingUser(user.id);
    await onUpdateRole(user.id, newRole);
    setUpdatingUser(null);
  };

  const handleToggleStatus = async (user) => {
    setUpdatingUser(user.id);
    await onToggleStatus(user.id, user.is_active);
    setUpdatingUser(null);
  };

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case "admin":
        return "bg-warning/10 text-warning border-warning/20";
      case "manager":
        return "bg-accent/10 text-accent border-accent/20";
      case "agent":
        return "bg-secondary/10 text-secondary border-secondary/20";
      default:
        return "bg-muted/10 text-muted-foreground border-muted/20";
    }
  };

  const getStatusBadgeColor = (isActive) => {
    return isActive
      ? "bg-success/10 text-success border-success/20"
      : "bg-error/10 text-error border-error/20";
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const canEditUser = (user) => {
    // Admins can edit everyone, managers can edit agents only
    if (currentUser.role === "admin") return true;
    if (currentUser.role === "manager" && user.role === "agent") return true;
    return false;
  };

  const canDeleteUser = (user) => {
    // Can't delete yourself, admins can delete managers and agents, managers can delete agents only
    if (user.id === currentUser.id) return false;
    if (currentUser.role === "admin" && user.role !== "admin") return true;
    if (currentUser.role === "manager" && user.role === "agent") return true;
    return false;
  };

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="p-6">
          <div className="space-y-4">
            {[...Array(5)].map((_, index) => (
              <div key={index} className="flex items-center space-x-4">
                <div className="w-10 h-10 bg-muted rounded-full skeleton"></div>
                <div className="flex-1 space-y-2">
                  <div className="w-32 h-4 bg-muted rounded skeleton"></div>
                  <div className="w-48 h-3 bg-muted rounded skeleton"></div>
                </div>
                <div className="w-16 h-6 bg-muted rounded skeleton"></div>
                <div className="w-16 h-6 bg-muted rounded skeleton"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!users || users.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-12 text-center">
        <Icon
          name="Users"
          size={48}
          className="text-muted-foreground mx-auto mb-4"
        />
        <h3 className="text-lg font-medium text-card-foreground mb-2">
          No Users Found
        </h3>
        <p className="text-muted-foreground">
          No users match your current filters. Try adjusting your search
          criteria.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Desktop Table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-4 font-medium text-card-foreground">
                User
              </th>
              <th className="text-left p-4 font-medium text-card-foreground">
                Role
              </th>
              <th className="text-left p-4 font-medium text-card-foreground">
                Status
              </th>
              <th className="text-left p-4 font-medium text-card-foreground">
                Created
              </th>
              <th className="text-right p-4 font-medium text-card-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user, index) => (
              <tr
                key={user.id}
                className={`border-t border-border hover:bg-muted/20 transition-colors ${
                  index % 2 === 0 ? "bg-background" : "bg-muted/5"
                }`}
              >
                {/* User Info */}
                <td className="p-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                      {user.avatar_url ? (
                        <img
                          src={user.avatar_url}
                          alt={user.full_name}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <Icon name="User" size={20} className="text-primary" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-card-foreground">
                        {user.full_name || "Unnamed User"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </div>
                </td>

                {/* Role */}
                <td className="p-4">
                  {canEditUser(user) ? (
                    <Select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user, e.target.value)}
                      options={[
                        ...(currentUser.role === "admin"
                          ? [
                              { value: "admin", label: "Admin" },
                              { value: "manager", label: "Manager" },
                            ]
                          : []),
                        { value: "agent", label: "Agent" },
                      ]}
                      disabled={updatingUser === user.id}
                      className="min-w-[120px]"
                    />
                  ) : (
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getRoleBadgeColor(
                        user.role
                      )}`}
                    >
                      {user.role?.charAt(0).toUpperCase() + user.role?.slice(1)}
                    </span>
                  )}
                </td>

                {/* Status */}
                <td className="p-4">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadgeColor(
                        user.is_active
                      )}`}
                    >
                      {user.is_active ? "Active" : "Inactive"}
                    </span>
                    {canEditUser(user) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleToggleStatus(user)}
                        disabled={updatingUser === user.id}
                        iconName={user.is_active ? "UserX" : "UserCheck"}
                        title={
                          user.is_active ? "Deactivate user" : "Activate user"
                        }
                      />
                    )}
                  </div>
                </td>

                {/* Created Date */}
                <td className="p-4">
                  <span className="text-sm text-muted-foreground">
                    {formatDate(user.created_at)}
                  </span>
                </td>

                {/* Actions */}
                <td className="p-4">
                  <div className="flex items-center justify-end space-x-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onView(user)}
                      iconName="Eye"
                      title="View user details"
                    />

                    {canEditUser(user) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onEdit(user)}
                        iconName="Edit2"
                        title="Edit user"
                      />
                    )}

                    {canDeleteUser(user) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDelete(user.id)}
                        iconName="Trash2"
                        title="Delete user"
                        className="text-error hover:text-error hover:bg-error/10"
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="lg:hidden space-y-4 p-4">
        {users.map((user) => (
          <div key={user.id} className="border border-border rounded-lg p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={user.full_name}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <Icon name="User" size={20} className="text-primary" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-card-foreground">
                    {user.full_name || "Unnamed User"}
                  </p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onView(user)}
                  iconName="Eye"
                />

                {canEditUser(user) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onEdit(user)}
                    iconName="Edit2"
                  />
                )}

                {canDeleteUser(user) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDelete(user.id)}
                    iconName="Trash2"
                    className="text-error hover:text-error hover:bg-error/10"
                  />
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Role:</span>
                <div className="mt-1">
                  {canEditUser(user) ? (
                    <Select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user, e.target.value)}
                      options={[
                        ...(currentUser.role === "admin"
                          ? [
                              { value: "admin", label: "Admin" },
                              { value: "manager", label: "Manager" },
                            ]
                          : []),
                        { value: "agent", label: "Agent" },
                      ]}
                      disabled={updatingUser === user.id}
                    />
                  ) : (
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getRoleBadgeColor(
                        user.role
                      )}`}
                    >
                      {user.role?.charAt(0).toUpperCase() + user.role?.slice(1)}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <span className="text-muted-foreground">Status:</span>
                <div className="mt-1 flex items-center space-x-2">
                  <span
                    className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getStatusBadgeColor(
                      user.is_active
                    )}`}
                  >
                    {user.is_active ? "Active" : "Inactive"}
                  </span>
                  {canEditUser(user) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleToggleStatus(user)}
                      disabled={updatingUser === user.id}
                      iconName={user.is_active ? "UserX" : "UserCheck"}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-border">
              <span className="text-xs text-muted-foreground">
                Created: {formatDate(user.created_at)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default UserTable;
