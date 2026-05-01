import React from "react";
import Icon from "components/AppIcon";
import Button from "components/ui/Button";
import { capitalize } from "utils/helper";

const PendingInvitations = ({ invitations, onCancel }) => {
  if (!invitations || invitations.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-12">
        <div className="flex flex-col items-center justify-center text-center">
          <Icon name="Mail" size={48} className="text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No pending invitations</p>
        </div>
      </div>
    );
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const isExpired = (expiresAt) => {
    return new Date(expiresAt) < new Date();
  };

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium">Name</th>
              <th className="text-left px-4 py-3 text-sm font-medium">Email</th>
              <th className="text-left px-4 py-3 text-sm font-medium">Role</th>
              <th className="text-left px-4 py-3 text-sm font-medium">
                Company
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium">
                Sent On
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium">
                Expires
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {invitations.map((invitation) => (
              <tr
                key={invitation.id}
                className={`hover:bg-accent ${
                  isExpired(invitation.expires_at) ? "opacity-50" : ""
                }`}
              >
                <td className="px-4 py-3">
                  <div className="font-medium">{invitation.full_name || "-"}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Icon name="Mail" size={16} className="text-primary" />
                    <span className="text-sm">{invitation.email}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded text-xs font-medium capitalize">
                    <Icon name="Briefcase" size={12} />
                    {capitalize(invitation.role)}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  {invitation.company?.name || "N/A"}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {formatDate(invitation.created_at)}
                </td>
                <td className="px-4 py-3">
                  {isExpired(invitation.expires_at) ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">
                      <Icon name="AlertCircle" size={12} />
                      Expired
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {formatDate(invitation.expires_at)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onCancel(invitation.id)}
                    title="Cancel Invitation"
                  >
                    <Icon name="X" size={16} className="text-red-500" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PendingInvitations;
