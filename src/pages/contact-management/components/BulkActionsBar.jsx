import React, { useState } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";

const BulkActionsBar = ({ selectedCount, onDelete }) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (selectedCount === 0) return null;

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    onDelete();
    setShowDeleteConfirm(false);
  };

  return (
    <>
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-400 animate-slide-up">
        <div className="bg-card border border-border rounded-lg shadow-enterprise-lg p-4 min-w-96">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                <Icon name="CheckSquare" size={16} className="text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-card-foreground">
                  {selectedCount} client{selectedCount !== 1 ? "s" : ""}{" "}
                  selected
                </p>
                <p className="text-xs text-muted-foreground">
                  Choose an action to apply to selected clients
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              className="transition-enterprise"
            >
              <Icon name="Trash2" size={14} className="mr-2" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-500 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div
              className="fixed inset-0 transition-opacity bg-background/80 backdrop-blur-sm"
              onClick={() => setShowDeleteConfirm(false)}
            ></div>
            <div className="inline-block w-full max-w-md my-8 overflow-hidden text-left align-middle transition-all transform bg-card border border-border rounded-lg shadow-enterprise-lg">
              <div className="p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-10 h-10 bg-destructive/10 rounded-full flex items-center justify-center">
                    <Icon
                      name="AlertTriangle"
                      size={20}
                      className="text-destructive"
                    />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-card-foreground">
                      Delete Clients
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Are you sure you want to delete {selectedCount} client
                      {selectedCount !== 1 ? "s" : ""}?
                    </p>
                  </div>
                </div>
                <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 mb-4">
                  <p className="text-sm text-destructive">
                    This action cannot be undone. All associated data will be
                    permanently removed.
                  </p>
                </div>
                <div className="flex justify-end space-x-3">
                  <Button
                    variant="outline"
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    Cancel
                  </Button>
                  <Button variant="destructive" onClick={confirmDelete}>
                    <Icon name="Trash2" size={16} className="mr-2" />
                    Delete {selectedCount} Client
                    {selectedCount !== 1 ? "s" : ""}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default BulkActionsBar;
