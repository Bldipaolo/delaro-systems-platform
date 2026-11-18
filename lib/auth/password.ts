export const minimumPasswordLength = 12;

export type PasswordRequirements = {
  length: boolean;
  lowercase: boolean;
  uppercase: boolean;
  number: boolean;
  symbol: boolean;
};

export function passwordRequirements(password: string): PasswordRequirements {
  return {
    length: password.length >= minimumPasswordLength,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
}

export function passwordMeetsRequirements(password: string) {
  return Object.values(passwordRequirements(password)).every(Boolean);
}
