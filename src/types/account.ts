export type UserAccount = {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  disabled: boolean;
  createdAt: string;
};
