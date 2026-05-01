import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import DealModal from "../../sales-pipeline/components/DealModal";
import ContactDetailModal from "../../contact-management/components/ContactDetailModal";
import TaskDetailModal from "../../task-management/components/TaskDetailModal";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../contexts/AuthContext";
import {
  dealService,
  contactService,
  taskService,
  userService,
} from "../../../services/supabaseService";

const QuickActions = ({ onActionClick }) => {
  const { user, userProfile, company } = useAuth();
  const navigate = useNavigate();
  const [isDealModalOpen, setIsDealModalOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);

  // Data for modals
  const [contacts, setContacts] = useState([]);
  const [deals, setDeals] = useState([]);
  const [users, setUsers] = useState([]);

  // Load data when component mounts
  useEffect(() => {
    const loadData = async () => {
      if (!company?.id) return;

      try {
        const [contactsResult, dealsResult, usersResult] = await Promise.all([
          contactService.getContacts(company.id),
          dealService.getDeals(company.id),
          userService.getCompanyUsers(company.id),
        ]);

        if (contactsResult.data) setContacts(contactsResult.data);
        if (dealsResult.data) setDeals(dealsResult.data);
        if (usersResult.data) setUsers(usersResult.data);
      } catch (error) {
        console.error("Error loading data for QuickActions:", error);
      }
    };

    loadData();
  }, [company?.id]);

  const quickActions = [
    {
      id: "new-deal",
      label: "New Deal",
      icon: "Plus",
      color: "bg-primary",
      textColor: "text-primary-foreground",
      description: "Create a new sales opportunity",
      path: "/sales-pipeline",
    },
    {
      id: "add-contact",
      label: "Add Contact",
      icon: "UserPlus",
      color: "bg-accent",
      textColor: "text-accent-foreground",
      description: "Add new customer or lead",
      path: "/contact-management",
    },
    {
      id: "create-task",
      label: "Create Task",
      icon: "CheckSquare",
      color: "bg-secondary",
      textColor: "text-secondary-foreground",
      description: "Assign new task to team",
      path: "/task-management",
    },
    // {
    //   id: "schedule-meeting",
    //   label: "Schedule Meeting",
    //   icon: "Calendar",
    //   color: "bg-warning",
    //   textColor: "text-warning-foreground",
    //   description: "Book meeting with client",
    //   path: "/task-management",
    // },
  ];

  const handleActionClick = (action) => {
    switch (action.id) {
      case "new-deal":
        setIsDealModalOpen(true);
        break;
      case "add-contact":
        setIsContactModalOpen(true);
        break;
      case "create-task":
        setIsTaskModalOpen(true);
        break;
      case "schedule-meeting":
        setIsMeetingModalOpen(true);
        break;
      default:
        if (onActionClick) {
          onActionClick(action);
        } else {
          window.location.href = action?.path;
        }
    }
  };

  // Save handlers for modals
  const handleDealSave = async (dealData) => {
    try {
      const { data, error } = await dealService.upsertDeal({
        ...dealData,
        company_id: company.id,
        owner_id: userProfile.id,
      });

      if (error) throw error;

      setIsDealModalOpen(false);
      // Return the saved deal so modal can add products
      return data;
    } catch (error) {
      console.error("Error creating deal:", error);
      throw error; // Let modal handle error display
    }
  };

  const handleContactSave = async (contactData) => {
    try {
      const { data, error } = await contactService.upsertContact({
        ...contactData,
        owner_id: userProfile.id,
      });

      if (error) throw error;

      setIsContactModalOpen(false);
      // Optionally refresh dashboard data or show success message
    } catch (error) {
      console.error("Error creating contact:", error);
      throw error; // Let modal handle error display
    }
  };

  const handleTaskSave = async (taskData) => {
    try {
      const taskPayload = {
        ...taskData,
        assigned_to: taskData.assigned_to || userProfile.id,
      };

      const { data, error } = await taskService.upsertTask(
        taskPayload,
        userProfile.id,
        company.id
      );

      if (error) {
        console.error("Task creation error:", error);
        throw error;
      }

      console.log("Task created successfully:", data);
      setIsTaskModalOpen(false);
      // Optionally refresh dashboard data or show success message
    } catch (error) {
      console.error("Error creating task:", error);
      throw error; // Let modal handle error display
    }
  };

  const handleDealSubmit = async (dealData) => {
    console.log("Submitting deal data:", dealData);
    try {
      // Ensure all required fields are present and properly formatted
      const dealPayload = {
        title: dealData.title,
        amount: parseFloat(dealData.amount),
        stage: dealData.stage,
        expected_close_date: dealData.expected_close_date,
        description: dealData.description || null,
        contact_id: dealData.contact_id,
        company_id: dealData.company_id,
        owner_id: user?.id, // Use the current user's ID directly
      };

      console.log("Formatted deal payload:", dealPayload);

      // First, verify that user is authenticated
      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !authUser) {
        throw new Error("You must be authenticated to create a deal");
      }

      const { data, error } = await supabase
        .from("deals")
        .insert([dealPayload])
        .select()
        .single();

      if (error) {
        console.error("Supabase error:", error);
        throw error;
      }

      console.log("Deal created successfully:", data);
      setIsDealModalOpen(false);
    } catch (error) {
      console.error("Error creating deal:", error);
      alert(error.message);
    }
  };

  const handleContactSubmit = async (contactData) => {
    console.log("Submitting contact data:", contactData);
    try {
      // Ensure all required fields are present
      const contactPayload = {
        first_name: contactData.first_name,
        last_name: contactData.last_name,
        email: contactData.email,
        phone: contactData.phone || null,
        job_title: contactData.job_title || null,
        company_id: contactData.company_id,
        owner_id: contactData.owner_id,
        status: contactData.status || "active",
      };

      console.log("Formatted contact payload:", contactPayload);

      const { data, error } = await supabase
        .from("contacts")
        .insert([contactPayload])
        .select()
        .single();

      if (error) {
        console.error("Supabase error:", error);
        throw error;
      }

      console.log("Contact created successfully:", data);
      setIsContactModalOpen(false);
    } catch (error) {
      console.error("Error creating contact:", error);
      alert(error.message);
    }
  };

  const handleTaskSubmit = async (taskData) => {
    console.log("Submitting task data:", taskData);
    try {
      // First verify user is authenticated
      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !authUser) {
        throw new Error("You must be authenticated to create a task");
      }

      // Debug auth state
      console.log("Auth state:", {
        authUser: authUser?.id,
        contextUser: user?.id,
        company: company?.id,
      });

      // Ensure all required fields are present
      const taskPayload = {
        title: taskData.title,
        description: taskData.description || null,
        priority: taskData.priority || "medium",
        status: taskData.status || "pending",
        task_type: taskData.task_type || "general",
        due_date: new Date(taskData.due_date).toISOString(),
        company_id: company?.id,
        contact_id: taskData.contact_id || null,
        deal_id: taskData.deal_id || null,
        assigned_to: taskData.assigned_to || user?.id,
        created_by: user?.id,
      };

      console.log("Formatted task payload:", taskPayload);

      // Add debugging log for payload
      console.log("Task payload before insert:", {
        ...taskPayload,
        company_id: company?.id,
        created_by: user?.id,
      });

      const { data, error } = await supabase
        .from("tasks")
        .insert([taskPayload])
        .select()
        .single();

      if (error) {
        console.error("Supabase error:", error);
        alert(error.message);
        throw error;
      }

      console.log("Task created successfully:", data);
      setIsTaskModalOpen(false);
    } catch (error) {
      console.error("Error creating task:", error);
      alert(error.message);
    }
  };

  const handleMeetingSubmit = async (meetingData) => {
    console.log("Submitting meeting data:", meetingData);
    try {
      // Ensure all required fields are present
      const meetingPayload = {
        title: meetingData.title,
        description: meetingData.description || null,
        meeting_date: meetingData.meeting_date,
        duration: parseInt(meetingData.duration),
        meeting_type: meetingData.meeting_type,
        location: meetingData.location || null,
        meeting_link: meetingData.meeting_link || null,
        company_id: meetingData.company_id,
        organizer_id: meetingData.organizer_id,
        deal_id: meetingData.deal_id || null,
        status: meetingData.status || "scheduled",
        attendees: meetingData.attendees,
      };

      console.log("Formatted meeting payload:", meetingPayload);

      const { data, error } = await supabase
        .from("meetings")
        .insert([meetingPayload])
        .select()
        .single();

      if (error) {
        console.error("Supabase error:", error);
        throw error;
      }

      console.log("Meeting created successfully:", data);
      setIsMeetingModalOpen(false);
    } catch (error) {
      console.error("Error creating meeting:", error);
      alert(error.message);
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6 enterprise-shadow">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-card-foreground">
          Quick Actions
        </h3>
        <Icon name="Zap" size={20} className="text-accent" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {quickActions?.map((action) => (
          <button
            key={action?.id}
            onClick={() => handleActionClick(action)}
            className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-enterprise group text-left"
          >
            <div
              className={`w-10 h-10 rounded-lg ${action?.color} flex items-center justify-center group-hover:scale-105 transition-transform`}
            >
              <Icon
                name={action?.icon}
                size={18}
                className={action?.textColor}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-card-foreground group-hover:text-primary transition-enterprise">
                {action?.label}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {action?.description}
              </p>
            </div>
            <Icon
              name="ChevronRight"
              size={16}
              className="text-muted-foreground group-hover:text-primary transition-enterprise"
            />
          </button>
        ))}
      </div>
      {/* <div className="mt-4 pt-4 border-t border-border">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center text-muted-foreground hover:text-primary"
          iconName="MoreHorizontal"
          iconPosition="left"
        >
          More Actions
        </Button>
      </div> */}

      {/* Modals */}
      <DealModal
        isOpen={isDealModalOpen}
        onClose={() => setIsDealModalOpen(false)}
        onSave={handleDealSave}
        deal={null}
        contacts={contacts}
        users={users}
      />
      <ContactDetailModal
        isOpen={isContactModalOpen}
        onClose={() => setIsContactModalOpen(false)}
        onSave={handleContactSave}
        contact={null}
        mode="create"
      />
      <TaskDetailModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onSave={handleTaskSave}
        task={null}
        contacts={contacts}
        deals={deals}
        users={users}
      />
    </div>
  );
};

export default QuickActions;
