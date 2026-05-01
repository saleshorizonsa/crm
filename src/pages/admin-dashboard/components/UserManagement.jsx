import React, { useState, useEffect } from "react";
import Icon from "components/AppIcon";
import Button from "components/ui/Button";
import {
  adminService,
  companyService,
} from "../../../services/supabaseService";
import InviteUserModal from "./InviteUserModal";
import UserHierarchyTree from "./UserHierarchyTree";
import PendingInvitations from "./PendingInvitations";
import UserDetailModal from "./UserDetailModal";

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [hierarchyData, setHierarchyData] = useState([]);
  const [pendingInvitations, setPendingInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [view, setView] = useState("hierarchy"); // hierarchy, list, invitations

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersRes, hierarchyRes, invitationsRes] = await Promise.all([
        adminService.getAllUsers(),
        adminService.getUserHierarchy(),
        adminService.getPendingInvitations(),
      ]);

      if (usersRes.error) {
        console.error("Error loading users:", usersRes.error);
      } else {
        console.log("Users loaded:", usersRes.data);
        setUsers(usersRes.data || []);
      }

      if (hierarchyRes.error) {
        console.error("Error loading hierarchy:", hierarchyRes.error);
      } else {
        setHierarchyData(hierarchyRes.data || []);
      }

      if (invitationsRes.error) {
        console.error("Error loading invitations:", invitationsRes.error);
      } else {
        setPendingInvitations(invitationsRes.data || []);
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleInviteSuccess = () => {
    setShowInviteModal(false);
    loadData();
  };

  const handleCancelInvitation = async (invitationId) => {
    if (!confirm("Are you sure you want to cancel this invitation?")) return;

    const { error } = await adminService.cancelInvitation(invitationId);
    if (error) {
      alert("Failed to cancel invitation: " + error.message);
    } else {
      loadData();
    }
  };

  const handleToggleUserStatus = async (userId, currentStatus) => {
    const action = currentStatus ? "deactivate" : "reactivate";
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;

    const { error } = currentStatus
      ? await adminService.deactivateUser(userId)
      : await adminService.reactivateUser(userId);

    if (error) {
      alert(`Failed to ${action} user: ` + error.message);
    } else {
      loadData();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Icon name="Loader2" className="animate-spin" size={32} />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Action Bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setView("hierarchy")}
            variant={view === "hierarchy" ? "default" : "outline"}
            size="sm"
          >
            <Icon name="Network" size={16} />
            Hierarchy
          </Button>
          <Button
            onClick={() => setView("list")}
            variant={view === "list" ? "default" : "outline"}
            size="sm"
          >
            <Icon name="List" size={16} />
            List View
          </Button>
          <Button
            onClick={() => setView("invitations")}
            variant={view === "invitations" ? "default" : "outline"}
            size="sm"
          >
            <Icon name="Mail" size={16} />
            Invitations ({pendingInvitations.length})
          </Button>
        </div>

        {/* <Button onClick={() => setShowInviteModal(true)}>
          <Icon name="UserPlus" size={16} />
          Invite User
        </Button> */}
      </div>

      {/* Content */}
      {view === "hierarchy" && (
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Organization Hierarchy</h2>
          <UserHierarchyTree
            data={hierarchyData}
            onToggleStatus={handleToggleUserStatus}
            onViewDetails={setSelectedUser}
          />
        </div>
      )}

      {view === "list" && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium">
                    Name
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium">
                    Email
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium">
                    Role
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium">
                    Company
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium">
                    Superior
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-accent cursor-pointer"
                    onClick={() => setSelectedUser(user)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {user.full_name || "N/A"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {user.email}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded text-xs font-medium capitalize">
                        <Icon name="Briefcase" size={12} />
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {user.role === "admin" || user.role === "director" ? (
                        <span className="text-muted-foreground italic">
                          All Companies
                        </span>
                      ) : (
                        user.company?.name || (
                          <span className="text-muted-foreground">N/A</span>
                        )
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {user.supervisor?.full_name || (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                          user.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {user.is_active ? (
                          <>
                            <Icon name="CheckCircle" size={12} />
                            Active
                          </>
                        ) : (
                          <>
                            <Icon name="XCircle" size={12} />
                            Inactive
                          </>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleUserStatus(user.id, user.is_active);
                        }}
                      >
                        {user.is_active ? (
                          <Icon name="UserX" size={16} />
                        ) : (
                          <Icon name="UserCheck" size={16} />
                        )}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "invitations" && (
        <PendingInvitations
          invitations={pendingInvitations}
          onCancel={handleCancelInvitation}
        />
      )}

      {/* Invite User Modal */}
      {showInviteModal && (
        <InviteUserModal
          onClose={() => setShowInviteModal(false)}
          onSuccess={handleInviteSuccess}
        />
      )}

      {/* User Detail Modal */}
      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onUpdate={() => {
            setSelectedUser(null);
            loadData();
          }}
        />
      )}
    </div>
  );
};

export default UserManagement;
