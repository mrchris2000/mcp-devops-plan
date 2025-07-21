# MCP DevOps Plan Server

A Model Context Protocol (MCP) server implementation for DevOps Plan, enabling work item management through standardized MCP clients.

## Features

- Retrieve applications and projects from Plan
- Get available components and work item types
- Create, retrieve, and delete work items
- Filter work items by type and owner

## Warranties
This MCP server is provided "as is" without any warranties. It is designed to work with the DevOps Plan system and may require specific configurations to function correctly. Users are responsible for ensuring compatibility with their Plan instance.
This server provides data destructive functionality, the author is not liable for any data loss due to use of this MCP capability.

## Example Use Cases

### 1. Setting Up a New Project Sprint
**Scenario**: You're a project manager starting a new sprint and need to create multiple work items for your team.

**Steps**:
1. "Get me all available applications in Plan"
2. "Show me the projects in the 'WebApp Development' application"
3. "What work item types are available in the 'Customer Portal' project?"
4. "Create a new Epic titled 'User Authentication System' in the Customer Portal project"
5. "Create three tasks: 'Design login UI', 'Implement OAuth integration', and 'Add password reset functionality'"

**Benefits**: Quickly set up organized work items for sprint planning and team assignment.

### 2. Sprint Review and Cleanup
**Scenario**: At the end of a sprint, you need to review completed work and clean up obsolete items.

**Steps**:
1. "Show me all work items in the 'Mobile App' project"
2. "Filter work items by type 'Bug' to see what issues were resolved"
3. "Show me work items assigned to 'john.doe' to review his contributions"
4. "Delete the work item with ID '12345' as it's no longer relevant"
5. "Create a summary report of completed vs remaining work items"

**Benefits**: Maintain clean project state and generate insights for retrospectives.

### 3. Cross-Team Dependency Management
**Scenario**: You're coordinating between frontend and backend teams and need to track dependencies.

**Steps**:
1. "Get all work items in the 'E-commerce Platform' project"
2. "Filter by work item type 'Story' to see feature requirements"
3. "Create a new task 'API endpoint for user profiles' in the 'Backend Services' component"
4. "Create a dependent task 'Integrate user profile API' in the 'Frontend' component"
5. "Check work items assigned to backend team members to see their current workload"

**Benefits**: Coordinate cross-functional work and ensure proper dependency tracking.

## Configuration

The server requires configuration for authentication and connection to your Plan instance. You can provide configuration in several ways:

### Quick Setup (Recommended)

Run the interactive setup script:

```bash
npm run setup
```

This will prompt you for your configuration values and create a `.env` file automatically.

### Option 1: Environment Variables

Set the following environment variables:

```bash
export PLAN_ACCESS_TOKEN="your_base64_encoded_token_here"
export PLAN_SERVER_URL="https://your-plan-server.com/plan"
export PLAN_TEAMSPACE_ID="your-teamspace-id-here"
```

### Option 2: Command Line Arguments

Pass configuration as command line arguments:

```bash
node src/lib/server.js --token "your_token" --server-url "https://your-server.com/plan" --teamspace-id "your-teamspace-id"
```

### Option 3: Environment File

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
# Edit .env with your actual configuration values
```

## Installation

### Option 1: Direct NPX Usage (Recommended)

You can run the MCP server directly without installation:

```bash
npx @securedevops/mcp-devops-plan --token "your_token" --server-url "https://your-server.com/plan" --teamspace-id "your-teamspace-id"
```

### Option 2: Global Installation

```bash
npm install -g @securedevops/mcp-devops-plan
mcp-devops-plan --token "your_token" --server-url "https://your-server.com/plan" --teamspace-id "your-teamspace-id"
```

### Option 3: Local Development

```bash
git clone https://github.com/securedevops/mcp-devops-plan.git
cd mcp-devops-plan
npm install
npm run setup  # Interactive configuration setup
npm start      # Start the MCP server
```

## Use with Claude Desktop

### Option 1: NPX (Recommended)

Add the following to your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "devops-plan": {
      "command": "npx",
      "args": [
        "@securedevops/mcp-devops-plan",
        "--token", "your_token_here",
        "--server-url", "https://your-server.com/plan",
        "--teamspace-id", "your_teamspace_id"
      ]
    }
  }
}
```

### Option 2: Environment Variables with NPX

```json
{
  "mcpServers": {
    "devops-plan": {
      "command": "npx",
      "args": ["@securedevops/mcp-devops-plan"],
      "env": {
        "PLAN_ACCESS_TOKEN": "your_token_here",
        "PLAN_SERVER_URL": "https://your-server.com/plan",
        "PLAN_TEAMSPACE_ID": "your_teamspace_id"
      }
    }
  }
}
```

### Option 3: Local Installation

Add the following to your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "devops-plan": {
      "command": "node",
      "args": ["/path/to/mcp-devops-plan/src/lib/server.js"],
      "env": {
        "PLAN_ACCESS_TOKEN": "your_token_here",
        "PLAN_SERVER_URL": "https://your-server.com/plan",
        "PLAN_TEAMSPACE_ID": "your_teamspace_id"
      }
    }
  }
}
```

Or with command line arguments:

```json
{
  "mcpServers": {
    "devops-plan": {
      "command": "node",
      "args": [
        "/path/to/mcp-devops-plan/src/lib/server.js",
        "--token", "your_token_here",
        "--server-url", "https://your-server.com/plan",
        "--teamspace-id", "your_teamspace_id"
      ]
    }
  }
}
```
## Usage

The MCP DevOps Plan server provides the following tools for interacting with DevOps Plan:

### Available Tools

#### 1. `get_applications`
**Purpose**: Retrieves all applications from the Plan system
**Parameters**: None
**Usage**: Use this to get a list of all available applications in your Plan instance. This is typically the first step to understand what applications you can work with.

#### 2. `get_available_projects`
**Purpose**: Get the list of projects in Plan for a given application
**Parameters**:
- `application` (string): Name of the plan application
**Usage**: Once you have an application name, use this to see all projects within that application.

#### 3. `get_available_components`
**Purpose**: Get the list of components for a project in Plan for a given application
**Parameters**:
- `application` (string): Name of the application
- `projectId` (string): ID of the project
**Usage**: Retrieve available components within a specific project. Components are optional organizational units for work items.

#### 4. `get_available_workitem_types`
**Purpose**: Get the available work item types for a project in Plan for a given application
**Parameters**:
- `application` (string): Name of the application
- `projectId` (string): ID of the project
**Usage**: Get the list of work item types (e.g., Task, Bug, Story) available in a specific project. This is needed before creating work items.

#### 5. `create_work_item`
**Purpose**: Creates a new work item in Plan
**Parameters**:
- `component` (string, optional): An optional component name if any are available in the project
- `title` (string): Title of the work item
- `description` (string): Description of the work item
- `workItemType` (string): Type of the work item from the list of available work item types
- `application` (string): Name of the application
- `projectId` (string): ID of the project
**Usage**: Create new work items like tasks, bugs, or stories in a specific project.

#### 6. `get_work_items`
**Purpose**: Retrieves all work items for a given application, can filter by work item type and specific owner
**Parameters**:
- `applicationName` (string): Name of the application
- `projectId` (string): ID of the project
- `workitemType` (string, optional): Type of the work item to filter by, if any
- `owner` (string, optional): Filter the work items by owner, if any
**Usage**: List existing work items with optional filtering. Use this to see current work items, track progress, or find specific items.

#### 7. `delete_work_item`
**Purpose**: Deletes a work item in Plan
**Parameters**:
- `dbid` (string): The dbid field from the work item to identify it (this is the first field returned for each work item in the get_work_items tool)
- `application` (string): Name of the application
**Usage**: Remove work items that are no longer needed. The dbid can be obtained from the get_work_items tool output.
