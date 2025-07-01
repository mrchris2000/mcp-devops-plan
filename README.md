# MCP DevOps Plan Server

A Model Context Protocol (MCP) server for DevOps Plan work item management, enabling comprehensive project planning and work item tracking through the Plan API.

## Overview

This MCP server provides tools for interacting with DevOps Plan, allowing you to:

- Create and manage work items
- Query work item status and details
- Manage projects and components
- Handle work item types and assignments
- Access team and application data

## Features

- **Work Item Management**: Create, delete, and query work items across projects
- **Project Organization**: Access available projects and components within applications
- **Team Collaboration**: Manage team-based work item assignments
- **Type Safety**: Built with TypeScript and Zod validation for reliable API interactions

## Installation

Install via npm:

```bash
npm install -g @securedevops/mcp-devops-plan
```

Or use with npx:

```bash
npx @securedevops/mcp-devops-plan
```

## Configuration

The Plan server requires API configuration. You can provide configuration through environment variables:

### Environment Variables

```bash
export PLAN_ACCESS_TOKEN="your_access_token_here"
export PLAN_SERVER_URL="https://your-plan-server.com/plan"
export PLAN_TEAMSPACE_ID="your-teamspace-id"
```

### Direct Usage

```bash
# Start the MCP server
node src/lib/server.js
```

Or with npm:

```bash
npm start
```

## MCP Client Configuration

To use this server with an MCP client, add it to your client's configuration:

```json
{
  "mcpServers": {
    "plan": {
      "command": "npx",
      "args": ["-y", "@securedevops/mcp-devops-plan"],
      "env": {
        "PLAN_ACCESS_TOKEN": "your_access_token_here",
        "PLAN_SERVER_URL": "https://your-plan-server.com/plan",
        "PLAN_TEAMSPACE_ID": "your-teamspace-id"
      }
    }
  }
}
```

## Available Tools

This server provides the following MCP tools:

### Work Item Management
- `mcp_plan_create_work_item` - Create a new work item
- `mcp_plan_delete_work_item` - Delete an existing work item
- `mcp_plan_get_work_items` - Retrieve work items with filtering options

### Project and Team Management
- `mcp_plan_get_applications` - List all available applications
- `mcp_plan_get_available_projects` - Get projects for an application
- `mcp_plan_get_available_components` - Get components for a project
- `mcp_plan_get_available_workitem_types` - Get work item types for a project

## Development

### Prerequisites

- Node.js 18.0.0 or higher
- Valid Plan API access token and server URL

### Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy environment configuration: `cp .env.example .env`
4. Update `.env` with your Plan configuration
5. Start the server: `npm start`

### Testing

```bash
npm test
```

## License

ISC License - see LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.