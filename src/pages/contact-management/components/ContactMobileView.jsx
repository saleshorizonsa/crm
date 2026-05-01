import React, { useState } from "react";
import Icon from "../../../components/AppIcon";
import Image from "../../../components/AppImage";
import Button from "../../../components/ui/Button";

const ContactMobileView = ({
  contacts,
  selectedContacts,
  onContactSelect,
  onContactClick,
  onQuickAction,
}) => {
  const [expandedCard, setExpandedCard] = useState(null);

  const getRelationshipStatusColor = (status) => {
    const colors = {
      "Hot Lead": "bg-red-100 text-red-800",
      "Warm Lead": "bg-orange-100 text-orange-800",
      "Cold Lead": "bg-blue-100 text-blue-800",
      Customer: "bg-green-100 text-green-800",
      Prospect: "bg-purple-100 text-purple-800",
      Partner: "bg-indigo-100 text-indigo-800",
    };
    return colors?.[status] || "bg-gray-100 text-gray-800";
  };

  const formatLastContact = (date) => {
    const now = new Date();
    const contactDate = new Date(date);
    const diffTime = Math.abs(now - contactDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)}w ago`;
    return contactDate?.toLocaleDateString();
  };

  const toggleExpanded = (contactId) => {
    setExpandedCard(expandedCard === contactId ? null : contactId);
  };

  return (
    <div className="space-y-3">
      {contacts?.map((contact) => (
        <div
          key={contact?.id}
          className={`bg-card border border-border rounded-lg transition-enterprise ${
            selectedContacts?.includes(contact?.id)
              ? "ring-2 ring-primary/20 border-primary/30"
              : ""
          }`}
        >
          {/* Main Card Content */}
          <div className="p-4">
            <div className="flex items-start space-x-3">
              {/* Checkbox */}
              <input
                type="checkbox"
                checked={selectedContacts?.includes(contact?.id)}
                onChange={(e) => {
                  if (e?.target?.checked) {
                    onContactSelect([...selectedContacts, contact?.id]);
                  } else {
                    onContactSelect(
                      selectedContacts?.filter((id) => id !== contact?.id)
                    );
                  }
                }}
                className="mt-1 rounded border-border"
                onClick={(e) => e?.stopPropagation()}
              />

              {/* Avatar */}
              <div className="w-12 h-12 rounded-full overflow-hidden bg-muted flex-shrink-0">
                <Image
                  src={contact?.avatar}
                  alt={contact?.name}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Contact Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-card-foreground truncate">
                      {contact?.name}
                    </h3>
                    <p className="text-xs text-muted-foreground truncate">
                      {contact?.role} at {contact?.company}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1">
                      {contact?.email}
                    </p>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleExpanded(contact?.id)}
                    className="h-8 w-8 ml-2"
                  >
                    <Icon
                      name={
                        expandedCard === contact?.id
                          ? "ChevronUp"
                          : "ChevronDown"
                      }
                      size={16}
                    />
                  </Button>
                </div>

                {/* Status and Last Contact */}
                <div className="flex items-center justify-between mt-2">
                  <span
                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getRelationshipStatusColor(
                      contact?.relationshipStatus
                    )}`}
                  >
                    {contact?.relationshipStatus}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatLastContact(contact?.lastContact)}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center justify-end space-x-2 mt-3 pt-3 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onQuickAction("email", contact)}
                className="text-xs"
              >
                <Icon name="Mail" size={14} className="mr-1" />
                Email
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onQuickAction("call", contact)}
                className="text-xs"
              >
                <Icon name="Phone" size={14} className="mr-1" />
                Call
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onContactClick(contact)}
                className="text-xs"
              >
                <Icon name="Eye" size={14} className="mr-1" />
                View
              </Button>
            </div>
          </div>

          {/* Expanded Details */}
          {expandedCard === contact?.id && (
            <div className="px-4 pb-4 border-t border-border animate-slide-down">
              <div className="pt-3 space-y-3">
                {/* Additional Info */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Phone:</span>
                    <p className="text-card-foreground mt-1">
                      {contact?.phone || "+1 (555) 123-4567"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Location:</span>
                    <p className="text-card-foreground mt-1">
                      San Francisco, CA
                    </p>
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <span className="text-xs text-muted-foreground">Tags:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {["VIP", "Decision Maker"]?.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Recent Activity */}
                <div>
                  <span className="text-xs text-muted-foreground">
                    Recent Activity:
                  </span>
                  <div className="mt-1 p-2 bg-muted/30 rounded text-xs">
                    <p className="text-card-foreground">
                      Email sent: Product Demo Follow-up
                    </p>
                    <p className="text-muted-foreground mt-1">2 hours ago</p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onQuickAction("task", contact)}
                    className="flex-1 text-xs"
                  >
                    <Icon name="Plus" size={14} className="mr-1" />
                    Add Task
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onQuickAction("deal", contact)}
                    className="flex-1 text-xs"
                  >
                    <Icon name="TrendingUp" size={14} className="mr-1" />
                    Create Deal
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
      {contacts?.length === 0 && (
        <div className="text-center py-12">
          <Icon
            name="Users"
            size={48}
            className="text-muted-foreground mx-auto mb-4"
          />
          <p className="text-muted-foreground">No clients found</p>
        </div>
      )}
    </div>
  );
};

export default ContactMobileView;
