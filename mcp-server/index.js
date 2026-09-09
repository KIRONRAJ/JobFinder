#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { updateStatus } from './tools/update-status.js';
import { getToday } from './tools/get-today.js';
import { getPending } from './tools/get-pending.js';
import { searchApplications } from './tools/search-applications.js';
import { logJob } from './tools/log-job.js';

const API_PORT = process.env.API_PORT || 5178;
const API_BASE = process.env.API_BASE || `http://localhost:${API_PORT}`;
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

const STATUS_VALUES = ['researching', 'applied', 'interview', 'offer', 'rejected', 'withdrawn'];

const server = new McpServer({ name: 'jobhq-mcp', version: '1.0.0' });

server.registerTool(
  'get_today',
  {
    title: "Get today's goals and due items",
    description:
      "Check today's deadlines, follow-ups due, and pending checklist tasks across all tracked job applications.",
    inputSchema: {},
  },
  async () => {
    const result = await getToday({ apiBase: API_BASE, token: MCP_AUTH_TOKEN });
    return {
      content: [{ type: 'text', text: result.text }],
      isError: result.isError,
    };
  }
);

server.registerTool(
  'get_pending',
  {
    title: 'Get active job pipeline overview',
    description:
      'View all active job applications grouped by status (Interview, Offer, Researching, Applied) with company names, roles, and status counts.',
    inputSchema: {},
  },
  async () => {
    const result = await getPending({ apiBase: API_BASE, token: MCP_AUTH_TOKEN });
    return {
      content: [{ type: 'text', text: result.text }],
      isError: result.isError,
    };
  }
);

server.registerTool(
  'search_applications',
  {
    title: 'Search job applications and listings',
    description:
      'Search tracked job applications by keyword (company, role, keywords, location, notes) or filter by application status (researching, applied, interview, offer, rejected, withdrawn).',
    inputSchema: {
      query: z
        .string()
        .optional()
        .describe(
          'Keyword to search across company, role, location, or notes (e.g. "security", "analyst", "Wellington")'
        ),
      status: z.enum(STATUS_VALUES).optional().describe('Filter by specific application status'),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe('Maximum number of results to return (default 10)'),
    },
  },
  async ({ query, status, limit }) => {
    const result = await searchApplications({
      query,
      status,
      limit,
      apiBase: API_BASE,
      token: MCP_AUTH_TOKEN,
    });
    return {
      content: [{ type: 'text', text: result.text }],
      isError: result.isError,
    };
  }
);

server.registerTool(
  'log_job',
  {
    title: 'Log new job application from URL or details',
    description:
      'Add a new job application entry to JobSearchHQ. You can provide a job link/URL (SEEK, LinkedIn, Trade Me, or company career page) to automatically scrape and extract the company, role, and location, or provide company and role explicitly.',
    inputSchema: {
      url: z
        .string()
        .optional()
        .describe('Job posting URL (e.g. SEEK, LinkedIn, Trade Me, or career site link)'),
      company: z.string().optional().describe('Company name (optional if URL provided)'),
      role: z.string().optional().describe('Job title/role (optional if URL provided)'),
      location: z.string().optional().describe('Job location (default: "Wellington, NZ")'),
      fit: z
        .enum(['strong', 'good', 'stretch', 'unrated'])
        .optional()
        .describe('Initial fit assessment'),
      status: z
        .enum(STATUS_VALUES)
        .optional()
        .default('researching')
        .describe('Status (default: researching)'),
      notes: z.string().optional().describe('Initial notes or recruiter details'),
    },
  },
  async ({ url, company, role, location, fit, status, notes }) => {
    const result = await logJob({
      url,
      company,
      role,
      location,
      fit,
      status,
      notes,
      apiBase: API_BASE,
      token: MCP_AUTH_TOKEN,
    });
    return {
      content: [{ type: 'text', text: result.text }],
      isError: result.isError,
    };
  }
);

server.registerTool(
  'update_status',
  {
    title: 'Update application status',
    description:
      'Change the status of an existing Job Search HQ application entry, going through the validated Express API (enum check, statusHistory, audit log, folder relocation). Never write applications.json directly — use this tool for any status change.',
    inputSchema: {
      id: z.string().describe('The application entry id, e.g. app_1788414000000_wk4pt'),
      status: z.enum(STATUS_VALUES).describe('New status value'),
      notes: z
        .string()
        .optional()
        .describe("Optional note — REPLACES the entry's existing notes field, it does not append"),
    },
  },
  async ({ id, status, notes }) => {
    const result = await updateStatus({ id, status, notes, apiBase: API_BASE, token: MCP_AUTH_TOKEN });
    return {
      content: [{ type: 'text', text: result.text }],
      isError: result.isError,
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
