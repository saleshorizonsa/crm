import React, { useState, useEffect } from "react";
import { useAuth } from "../../../../contexts/AuthContext";
import { supabase } from "../../../../lib/supabase";
import Button from "../../../../components/ui/Button";
import Input from "../../../../components/ui/Input";
import Select from "../../../../components/ui/Select";

const MeetingModal = ({ isOpen, onClose, onSubmit }) => {
  const { company, user } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [deals, setDeals] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    meeting_date: "",
    duration: 30,
    location: "",
    meeting_type: "in_person",
    meeting_link: "",
    attendees: [],
    deal_id: "",
    status: "scheduled",
  });

  const meetingTypes = [
    { value: "in_person", label: "In Person" },
    { value: "virtual", label: "Virtual" },
    { value: "phone", label: "Phone Call" },
  ];

  const durations = [
    { value: 15, label: "15 minutes" },
    { value: 30, label: "30 minutes" },
    { value: 45, label: "45 minutes" },
    { value: 60, label: "1 hour" },
    { value: 90, label: "1.5 hours" },
    { value: 120, label: "2 hours" },
  ];

  useEffect(() => {
    const loadData = async () => {
      if (!company?.id) return;

      try {
        // Load contacts
        const { data: contactsData } = await supabase
          .from("contacts")
          .select("id, first_name, last_name, email")
          .eq("company_id", company.id);
        setContacts(contactsData || []);

        // Load deals
        const { data: dealsData } = await supabase
          .from("deals")
          .select("id, title")
          .eq("company_id", company.id);
        setDeals(dealsData || []);

        // Load users (team members)
        const { data: usersData } = await supabase
          .from("users")
          .select("id, full_name, email")
          .eq("company_id", company.id);
        setUsers(usersData || []);
      } catch (error) {
        console.error("Error loading meeting related data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [company?.id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleAttendeesChange = (e) => {
    const selectedOptions = Array.from(e.target.selectedOptions).map(
      (option) => option.value
    );
    setFormData((prev) => ({
      ...prev,
      attendees: selectedOptions,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await onSubmit({
        ...formData,
        company_id: company?.id,
        organizer_id: user?.id,
        meeting_date: new Date(formData.meeting_date).toISOString(),
      });
      onClose();
    } catch (error) {
      console.error("Error creating meeting:", error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50">
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-lg shadow-enterprise-lg w-full max-w-lg">
          <div className="p-6 border-b border-border">
            <h2 className="text-xl font-semibold text-card-foreground">
              Schedule Meeting
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-card-foreground">
                Meeting Title
              </label>
              <Input
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="Enter meeting title"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-card-foreground">
                  Date & Time
                </label>
                <Input
                  name="meeting_date"
                  type="datetime-local"
                  value={formData.meeting_date}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-card-foreground">
                  Duration
                </label>
                <Select
                  name="duration"
                  value={formData.duration}
                  onChange={handleChange}
                  options={durations}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-card-foreground">
                Meeting Type
              </label>
              <Select
                name="meeting_type"
                value={formData.meeting_type}
                onChange={handleChange}
                options={meetingTypes}
                required
              />
            </div>

            {formData.meeting_type === "in_person" ? (
              <div className="space-y-2">
                <label className="text-sm font-medium text-card-foreground">
                  Location
                </label>
                <Input
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  placeholder="Enter meeting location"
                  required
                />
              </div>
            ) : formData.meeting_type === "virtual" ? (
              <div className="space-y-2">
                <label className="text-sm font-medium text-card-foreground">
                  Meeting Link
                </label>
                <Input
                  name="meeting_link"
                  value={formData.meeting_link}
                  onChange={handleChange}
                  placeholder="Enter virtual meeting link"
                  required
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-sm font-medium text-card-foreground">
                Attendees
              </label>
              <select
                name="attendees"
                multiple
                value={formData.attendees}
                onChange={handleAttendeesChange}
                className="w-full min-h-[100px] px-3 py-2 text-sm rounded-md border border-input bg-transparent ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <optgroup label="Team Members">
                  {users.map((user) => (
                    <option key={`user-${user.id}`} value={user.id}>
                      {user.full_name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Contacts">
                  {contacts.map((contact) => (
                    <option key={`contact-${contact.id}`} value={contact.id}>
                      {`${contact.first_name} ${contact.last_name}`}
                    </option>
                  ))}
                </optgroup>
              </select>
              <p className="text-xs text-muted-foreground">
                Hold Ctrl/Cmd to select multiple attendees
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-card-foreground">
                Related Deal
              </label>
              <Select
                name="deal_id"
                value={formData.deal_id}
                onChange={handleChange}
                options={deals.map((deal) => ({
                  value: deal.id,
                  label: deal.title,
                }))}
                placeholder={isLoading ? "Loading deals..." : "Select deal"}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-card-foreground">
                Description / Agenda
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                className="w-full min-h-[100px] px-3 py-2 text-sm rounded-md border border-input bg-transparent ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="Enter meeting description or agenda"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">Schedule Meeting</Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default MeetingModal;
