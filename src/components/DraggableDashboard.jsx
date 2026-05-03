import React, { useState, useCallback } from "react";
import GridLayout, { WidthProvider } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { useDashboardLayout } from "../hooks/useDashboardLayout";
import Icon from "./AppIcon";
import Button from "./ui/Button";

const RGL = WidthProvider(GridLayout);

const COLS = 3;
const ROW_HEIGHT = 120;
const MARGIN = [16, 16];

// ── Widget card ────────────────────────────────────────────────────────────────

const WidgetCard = ({ title, editMode, onHide, children }) => {
  if (!editMode) {
    return <div className="h-full overflow-auto">{children}</div>;
  }
  return (
    <div className="h-full flex flex-col ring-2 ring-primary/30 rounded-lg overflow-hidden">
      {/* Edit-mode drag handle bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/70 border-b border-border flex-shrink-0 select-none">
        <div className="drag-handle flex items-center gap-2 cursor-grab active:cursor-grabbing flex-1 min-w-0 pr-2">
          <Icon name="GripVertical" size={14} className="text-muted-foreground flex-shrink-0" />
          <span className="text-xs font-medium text-muted-foreground truncate">{title}</span>
        </div>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onHide}
          className="flex-shrink-0 p-0.5 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          title={`Hide "${title}"`}
        >
          <Icon name="X" size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-auto min-h-0">{children}</div>
    </div>
  );
};

// ── Restore chip ───────────────────────────────────────────────────────────────

const RestoreChip = ({ label, onRestore }) => (
  <button
    onClick={onRestore}
    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-border bg-muted/40 text-muted-foreground text-xs font-medium hover:bg-muted hover:text-card-foreground transition-colors"
    title={`Restore "${label}"`}
  >
    <Icon name="Plus" size={10} />
    {label}
  </button>
);

// ── Main component ─────────────────────────────────────────────────────────────

/**
 * DraggableDashboard
 *
 * Props:
 *   widgets  – { [widgetId]: { title: string, component: ReactNode } }
 *   role     – role string forwarded for display / logging (layout is owned by the hook)
 */
const DraggableDashboard = ({ widgets = {}, role }) => {
  const {
    visibleLayout,
    hiddenWidgets,
    isLoading,
    isDirty,
    saveLayout,
    toggleWidget,
    resetLayout,
  } = useDashboardLayout();

  const [editMode, setEditMode] = useState(false);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleDragStop = useCallback(
    (_layout, _old, _new, _placeholder, _e, element) => {
      // RGL passes the full updated layout as first arg
      saveLayout(_layout);
    },
    [saveLayout]
  );

  const handleResizeStop = useCallback(
    (_layout) => {
      saveLayout(_layout);
    },
    [saveLayout]
  );

  const handleToggleDone = useCallback(() => {
    setEditMode(false);
  }, []);

  const handleReset = useCallback(async () => {
    await resetLayout();
    setEditMode(false);
  }, [resetLayout]);

  // ── Derived data ──────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Only include grid items that have a matching widget definition
  const renderableLayout = visibleLayout.filter((item) => widgets[item.i]);

  // Chips for widgets the user hid that still exist in the widgets map
  const restorableIds = [...hiddenWidgets].filter((id) => widgets[id]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* ── Toolbar ── */}
      <div className="sticky top-0 z-20 flex items-center justify-between flex-wrap gap-2 py-2 bg-background/80 backdrop-blur-sm border-b border-border/60 px-1 -mx-1">
        {/* Left: edit toggle + reset + restore chips */}
        <div className="flex items-center gap-2 flex-wrap">
          {editMode ? (
            <>
              <Button
                variant="default"
                size="sm"
                onClick={handleToggleDone}
                iconName="Check"
                iconPosition="left"
              >
                Done
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                iconName="RotateCcw"
                iconPosition="left"
              >
                Reset
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditMode(true)}
              iconName="LayoutDashboard"
              iconPosition="left"
            >
              Edit layout
            </Button>
          )}

          {/* Restore chips — always visible so users know what's hidden */}
          {restorableIds.map((id) => (
            <RestoreChip
              key={id}
              label={widgets[id].title}
              onRestore={() => toggleWidget(id)}
            />
          ))}
        </div>

        {/* Right: hint text in edit mode */}
        {editMode && (
          <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
            <Icon name="GripVertical" size={12} />
            Drag · Resize · ✕ to hide
          </span>
        )}
      </div>

      {/* ── Grid ── */}
      {renderableLayout.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground border border-dashed border-border rounded-lg">
          <Icon name="LayoutDashboard" size={32} className="opacity-30" />
          <p className="text-sm">All widgets are hidden.</p>
          {restorableIds.length > 0 && (
            <p className="text-xs">Use the chips above to restore them.</p>
          )}
        </div>
      ) : (
        <RGL
          layout={renderableLayout}
          cols={COLS}
          rowHeight={ROW_HEIGHT}
          margin={MARGIN}
          containerPadding={[0, 0]}
          draggableHandle=".drag-handle"
          isDraggable={editMode}
          isResizable={editMode}
          onDragStop={handleDragStop}
          onResizeStop={handleResizeStop}
          resizeHandles={["se"]}
          /* prevent layout thrashing on unmount */
          useCSSTransforms
        >
          {renderableLayout.map((item) => {
            const widget = widgets[item.i];
            return (
              <div key={item.i}>
                <WidgetCard
                  title={widget.title}
                  editMode={editMode}
                  onHide={() => toggleWidget(item.i)}
                >
                  {widget.component}
                </WidgetCard>
              </div>
            );
          })}
        </RGL>
      )}
    </div>
  );
};

export default DraggableDashboard;
