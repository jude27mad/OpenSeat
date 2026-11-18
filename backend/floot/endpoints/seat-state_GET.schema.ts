import { z } from "zod";
export const schema = z.object({room:z.string(), listen:z.string().optional()});
export type OutputType = {events:unknown[];now:number;socket?:{url:string;token:string;channel:string}};
