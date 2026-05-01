import React from 'react';
import Icon from '../../../components/AppIcon';

const SecurityBadges = () => {
  const securityFeatures = [
    {
      icon: 'Shield',
      title: 'Enterprise Security',
      description: 'Bank-level encryption and security protocols'
    },
    {
      icon: 'Lock',
      title: 'SSL Secured',
      description: '256-bit SSL certificate protection'
    },
    {
      icon: 'CheckCircle',
      title: 'SOC 2 Compliant',
      description: 'Audited security and availability controls'
    },
    {
      icon: 'Eye',
      title: 'Privacy Protected',
      description: 'GDPR and CCPA compliant data handling'
    }
  ];

  const trustIndicators = [
    { label: 'ISO 27001 Certified', icon: 'Award' },
    { label: '99.9% Uptime SLA', icon: 'Activity' },
    { label: '24/7 Security Monitoring', icon: 'Clock' }
  ];

  return (
    <div className="space-y-6">
      {/* Main Security Features */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {securityFeatures?.map((feature, index) => (
          <div
            key={index}
            className="flex items-start space-x-3 p-3 bg-muted/30 rounded-lg border border-border/50"
          >
            <div className="w-8 h-8 bg-success/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <Icon name={feature?.icon} size={16} color="var(--color-success)" />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-medium text-foreground">{feature?.title}</h4>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {feature?.description}
              </p>
            </div>
          </div>
        ))}
      </div>
      {/* Trust Indicators */}
      <div className="border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
          {trustIndicators?.map((indicator, index) => (
            <div key={index} className="flex items-center space-x-1.5">
              <Icon name={indicator?.icon} size={12} color="var(--color-success)" />
              <span>{indicator?.label}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Security Notice */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <Icon name="Info" size={16} color="var(--color-primary)" className="mt-0.5" />
          <div className="text-xs text-primary/80 leading-relaxed">
            <p className="font-medium mb-1">Secure Business Environment</p>
            <p>
              Your login credentials are encrypted and protected by enterprise-grade security measures. 
              We never store your password in plain text and use multi-factor authentication to ensure 
              only authorized personnel can access company data.
            </p>
          </div>
        </div>
      </div>
      {/* Last Updated */}
      <div className="text-center">
        <p className="text-xs text-muted-foreground">
          Security protocols last updated: October 2025
        </p>
      </div>
    </div>
  );
};

export default SecurityBadges;