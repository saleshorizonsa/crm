import React, { useState, useEffect, useRef } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';


const MFAVerification = ({ onVerify, onResend, isLoading, userEmail }) => {
  const [verificationCode, setVerificationCode] = useState(['', '', '', '', '', '']);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes
  const [canResend, setCanResend] = useState(false);
  const [error, setError] = useState('');
  const inputRefs = useRef([]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds?.toString()?.padStart(2, '0')}`;
  };

  const handleCodeChange = (index, value) => {
    if (value?.length > 1) return;
    
    const newCode = [...verificationCode];
    newCode[index] = value;
    setVerificationCode(newCode);
    setError('');

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs?.current?.[index + 1]?.focus();
    }

    // Auto-submit when all fields are filled
    if (newCode?.every(digit => digit !== '') && newCode?.join('')?.length === 6) {
      handleVerify(newCode?.join(''));
    }
  };

  const handleKeyDown = (index, e) => {
    if (e?.key === 'Backspace' && !verificationCode?.[index] && index > 0) {
      inputRefs?.current?.[index - 1]?.focus();
    }
  };

  const handleVerify = (code = verificationCode?.join('')) => {
    if (code?.length !== 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }
    onVerify(code);
  };

  const handleResend = () => {
    setTimeLeft(300);
    setCanResend(false);
    setVerificationCode(['', '', '', '', '', '']);
    setError('');
    onResend();
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Icon name="Shield" size={24} color="var(--color-primary)" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">Two-Factor Authentication</h3>
        <p className="text-sm text-muted-foreground">
          We've sent a 6-digit verification code to
        </p>
        <p className="text-sm font-medium text-foreground">{userEmail}</p>
      </div>
      <div className="space-y-4">
        <div className="flex justify-center space-x-3">
          {verificationCode?.map((digit, index) => (
            <input
              key={index}
              ref={el => inputRefs.current[index] = el}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={digit}
              onChange={(e) => handleCodeChange(index, e?.target?.value?.replace(/\D/g, ''))}
              onKeyDown={(e) => handleKeyDown(index, e)}
              className="w-12 h-12 text-center text-lg font-semibold border border-border rounded-md focus:ring-2 focus:ring-primary focus:border-primary transition-enterprise"
              disabled={isLoading}
            />
          ))}
        </div>

        {error && (
          <div className="flex items-center space-x-2 text-sm text-destructive">
            <Icon name="AlertCircle" size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Code expires in: <span className="font-medium text-foreground">{formatTime(timeLeft)}</span>
          </p>

          {canResend ? (
            <button
              type="button"
              onClick={handleResend}
              className="text-sm text-primary hover:text-primary/80 transition-enterprise"
              disabled={isLoading}
            >
              Resend verification code
            </button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Didn't receive the code? You can resend in {formatTime(timeLeft)}
            </p>
          )}
        </div>
      </div>
      <div className="space-y-3">
        <Button
          type="button"
          variant="default"
          fullWidth
          loading={isLoading}
          disabled={isLoading || verificationCode?.join('')?.length !== 6}
          onClick={() => handleVerify()}
        >
          Verify Code
        </Button>

        <Button
          type="button"
          variant="ghost"
          fullWidth
          disabled={isLoading}
          onClick={() => window.location?.reload()}
        >
          <Icon name="ArrowLeft" size={16} className="mr-2" />
          Back to Login
        </Button>
      </div>
    </div>
  );
};

export default MFAVerification;