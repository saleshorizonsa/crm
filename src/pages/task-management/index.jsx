import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import Icon from "../../components/AppIcon";
import Button from "../../components/ui/Button";
import NavigationBreadcrumbs from "../../components/ui/NavigationBreadcrumbs";
import Header from "../../components/ui/Header";
import TaskKanbanBoard from "./components/TaskKanbanBoard";
import TaskListView from "./components/TaskListView";
import TaskFilters from "./components/TaskFilters";
import TaskDetailModal from "./components/TaskDetailModal";
import TaskStats from "./components/TaskStats";
import { useAuth } from "../../contexts/AuthContext";
import {
  taskService,
  contactService,
  dealService,
  userService,
  activityService,
} from "../../services/supabaseService";

const TaskManagement = () => {
  const { user, company } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [deals, setDeals] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [viewMode, setViewMode] = useState("kanban"); // 'kanban' or 'list'
  const [selectedTasks, setSelectedTasks] = useState([]);
  const [filters, setFilters] = useState({
    search: "",
    priority: "",
    status: "",
    assignedTo: "",
  });
  const loadingRef = React.useRef(false);

  // Handle URL params for opening specific task
  useEffect(() => {
    const taskId = searchParams.get('taskId');
    if (taskId && tasks.length > 0) {
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        setSelectedTask(task);
        setShowTaskModal(true);
        // Clear the URL param after opening
        setSearchParams({});
      }
    }
  }, [searchParams, tasks]);

  useEffect(() => {
    if (user?.id && company?.id) {
      loadTasks();
      loadStats();
      loadContacts();
      loadDeals();
      loadUsers();
    }
  }, [user?.id, company?.id]);

  const loadTasks = async () => {
    if (loadingRef.current) return;

    loadingRef.current = true;
    setIsLoading(true);
    try {
      const { data, error } = await taskService.getMyTasks(
        user.id,
        company.id,
        filters
      );
      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error("Error loading tasks:", error);
    } finally {
      setIsLoading(false);
      loadingRef.current = false;
    }
  };

  const loadStats = async () => {
    try {
      const { data, error } = await taskService.getTaskStats(
        company.id,
        user.id
      );
      if (error) throw error;
      setStats(data);
    } catch (error) {
      console.error("Error loading task stats:", error);
    }
  };

  const loadContacts = async () => {
    try {
      // contactService.getContacts expects (companyId, filters)
      const { data, error } = await contactService.getContacts(company.id);
      if (error) throw error;
      setContacts(data || []);
    } catch (error) {
      console.error("Error loading contacts:", error);
    }
  };

  const loadDeals = async () => {
    try {
      const { data, error } = await dealService.getDeals(company.id);
      if (error) throw error;
      setDeals(data || []);
    } catch (error) {
      console.error("Error loading deals:", error);
    }
  };

  const loadUsers = async () => {
    try {
      // userService exposes getCompanyUsers
      const { data, error } = await userService.getCompanyUsers(company.id);
      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error("Error loading users:", error);
    }
  };

  const handleCreateTask = () => {
    setSelectedTask(null);
    setShowTaskModal(true);
  };

  const handleEditTask = (task) => {
    setSelectedTask(task);
    setShowTaskModal(true);
  };

  const handleTaskSave = async (taskData) => {
    try {
      const { data, error } = await taskService.upsertTask(
        taskData,
        user.id,
        company.id
      );
      if (error) throw error;

      await loadTasks();
      setShowTaskModal(false);
      setSelectedTask(null);
      loadStats();
    } catch (error) {
      console.error("Error saving task:", error);
      throw error; // Re-throw to let modal handle the error display
    }
  };

  const handleTaskUpdate = async (taskData) => {
    try {
      // Remove computed fields that don't exist in the database
      const {
        contact_name,
        deal_title,
        assigned_to_name,
        created_by_name,
        contact,
        deal,
        assigned_user,
        created_user,
        ...dbFields
      } = taskData;

      const { data, error } = await taskService.updateTask(
        taskData.id,
        dbFields
      );
      if (error) throw error;

      await loadTasks();
      loadStats();
    } catch (error) {
      console.error("Error updating task:", error);
      alert(`Failed to update task: ${error.message}`);
    }
  };

  const handleTaskStatusChange = async (taskId, newStatus) => {
    try {
      const updates = {
        status: newStatus,
        completed_at:
          newStatus === "completed" ? new Date().toISOString() : null,
      };

      const { data, error } = await taskService.updateTask(taskId, updates);
      if (error) throw error;

      setTasks(tasks.map((t) => (t.id === taskId ? data : t)));
      loadStats();
      
      // Log activity for task status change
      if (newStatus === "completed") {
        await activityService.createActivity({
          type: 'task',
          title: `Task completed: ${data.title}`,
          description: data.description || 'Task marked as completed',
          company_id: company?.id,
          contact_id: data.contact_id,
          deal_id: data.deal_id,
          owner_id: user?.id,
        });
      }
    } catch (error) {
      console.error("Error updating task status:", error);
      alert(`Failed to update task: ${error.message}`);
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm("Are you sure you want to delete this task?")) {
      return;
    }

    try {
      const { error } = await taskService.deleteTask(taskId);
      if (error) throw error;

      setTasks(tasks.filter((t) => t.id !== taskId));
      loadStats();
    } catch (error) {
      console.error("Error deleting task:", error);
      alert(`Failed to delete task: ${error.message}`);
    }
  };

  const filteredTasks = useMemo(() => {
    let filtered = [...tasks];

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(
        (task) =>
          task.title?.toLowerCase().includes(searchLower) ||
          task.description?.toLowerCase().includes(searchLower)
      );
    }

    if (filters.priority) {
      filtered = filtered.filter((task) => task.priority === filters.priority);
    }

    if (filters.status) {
      filtered = filtered.filter((task) => task.status === filters.status);
    }

    if (filters.assignedTo) {
      filtered = filtered.filter(
        (task) => task.assigned_to === filters.assignedTo
      );
    }

    return filtered;
  }, [tasks, filters]);

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="p-6">
        <div className="mb-6 flex justify-between items-center">
          <div>
            <NavigationBreadcrumbs
              items={[
                { label: "Dashboard", href: "/company-dashboard" },
                { label: "Tasks", href: "/tasks" },
              ]}
            />
            <h1 className="text-2xl font-semibold text-gray-900 mt-2">
              Task Management
            </h1>
          </div>

          <div className="flex items-center space-x-3">
            {/* View Toggle */}
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              <Button
                variant={viewMode === "kanban" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("kanban")}
                className="flex items-center gap-2"
              >
                <Icon name="Kanban" size={16} />
                Kanban
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("list")}
                className="flex items-center gap-2"
              >
                <Icon name="Table" size={16} />
                Table
              </Button>
            </div>

            <Button variant="primary" onClick={handleCreateTask}>
              <Icon name="Plus" className="w-4 h-4 mr-2" />
              New Task
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          {/* Task Stats */}
          <TaskStats stats={stats} />

          {/* Filters */}
          <TaskFilters filters={filters} onFilterChange={setFilters} />

          {/* Task Views */}
          {viewMode === "kanban" ? (
            <TaskKanbanBoard
              tasks={filteredTasks}
              onTaskClick={handleEditTask}
              onTaskUpdate={handleTaskUpdate}
              isLoading={isLoading}
            />
          ) : (
            <TaskListView
              tasks={filteredTasks}
              onTaskClick={handleEditTask}
              onTaskUpdate={handleTaskUpdate}
              onTaskDelete={handleDeleteTask}
              selectedTasks={selectedTasks}
              onTaskSelect={setSelectedTasks}
              isLoading={isLoading}
            />
          )}
        </div>
      </main>

      {/* Task Modal */}
      {showTaskModal && (
        <TaskDetailModal
          task={selectedTask}
          isOpen={showTaskModal}
          onSave={handleTaskSave}
          onClose={() => {
            setShowTaskModal(false);
            setSelectedTask(null);
          }}
          contacts={contacts}
          deals={deals}
          users={users}
        />
      )}
    </div>
  );
};

export default TaskManagement;
