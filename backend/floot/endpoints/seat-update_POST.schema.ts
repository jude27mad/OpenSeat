import { z } from "zod";
export const schema = z.object({room:z.string(),source:z.enum(["report","qr","sensor","ble"]),target:z.string(),value:z.union([z.string(),z.number()]),id:z.string()});
export type OutputType = {event:unknown};
