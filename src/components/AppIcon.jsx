import React from "react";
import { icons } from "lucide-react";

function Icon({
  name,
  size = 24,
  color = "currentColor",
  className = "",
  strokeWidth = 2,
  ...props
}) {
  const IconComponent = icons?.[name];

  if (!IconComponent) {
    // Fallback to HelpCircle if icon not found
    const HelpCircle = icons?.HelpCircle;
    if (HelpCircle) {
      return (
        <HelpCircle
          size={size}
          color="gray"
          strokeWidth={strokeWidth}
          className={className}
          {...props}
        />
      );
    }
    return null;
  }

  return (
    <IconComponent
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      className={className}
      {...props}
    />
  );
}
export default Icon;
