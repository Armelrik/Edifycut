import "server-only";
import { cache } from "react";
import { neonAccount } from "@/lib/neon/accounts";
import type { Account } from "./database";

export const currentUser = cache(async (): Promise<Account | null> => neonAccount());
