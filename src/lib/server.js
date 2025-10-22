#!/usr/bin/env node


import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { config as loadEnv } from 'dotenv';

// Load environment variables from .env file if it exists
loadEnv();

// Configuration from environment variables or command line arguments
function getConfig() {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const config = {};
    
    for (let i = 0; i < args.length; i += 2) {
        const key = args[i];
        const value = args[i + 1];
        
        switch (key) {
            case '--token':
                config.token = value;
                break;
            case '--server-url':
                config.serverUrl = value;
                break;
            case '--teamspace-id':
                config.teamspaceId = value;
                break;
        }
    }
    
    // Environment variables take precedence if not provided via command line
    const personal_access_token_string = config.token || process.env.PLAN_ACCESS_TOKEN;
    const serverURL = config.serverUrl || process.env.PLAN_SERVER_URL;
    const teamspaceID = config.teamspaceId || process.env.PLAN_TEAMSPACE_ID;
    
    // Validate required configuration
    if (!personal_access_token_string) {
        throw new Error("Personal access token is required. Set PLAN_ACCESS_TOKEN environment variable or use --token argument.");
    }
    if (!serverURL) {
        throw new Error("Server URL is required. Set PLAN_SERVER_URL environment variable or use --server-url argument.");
    }
    if (!teamspaceID) {
        throw new Error("Teamspace ID is required. Set PLAN_TEAMSPACE_ID environment variable or use --teamspace-id argument.");
    }
    
    return { personal_access_token_string, serverURL, teamspaceID };
}

// Get configuration at startup
const { personal_access_token_string, serverURL, teamspaceID } = getConfig();

// Create an MCP server
const server = new McpServer({
    name: "MCP DevOps Plan",
    version: "1.0.0"
});
var globalCookies = "";

async function getCookiesFromServer(serverURL) {
    try {
        let response = await fetch(`${serverURL}/ccmweb/rest/analytics/serverurl`, {
            method: 'GET',
            credentials: 'include'
        });

        if (!response.ok) {
            console.error('Failed to fetch cookies:', response.statusText);
            return null;
        }

        const cookies = response.headers.get('set-cookie');
        if (!cookies || cookies.length === 0) {
            console.error('No cookies found in the response.');
            return null;
        }

        //let formattedCookies = cookies.map(cookie => cookie.split(';')[0]).join('; ');
        globalCookies = cookies; // Store cookies globally
        return cookies;
    } catch (error) {
        console.error('Error fetching cookies:', error);
        return null;
    }
}

// Cleanup handler
async function cleanup() {
    process.exit(0);
}

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

/**
 * Shared helper function for updating entities using the Edit+Commit pattern
 * @param {string} application - Name of the Plan application
 * @param {string} entityType - Entity type (e.g., "Sprint", "Release", "WorkItem")
 * @param {string} entityDbid - The dbid of the entity to update
 * @param {Array} editFields - Array of {name, value} for Edit operation
 * @param {Array} commitFields - Array of full field objects for Commit operation
 * @param {Object} commitPayloadExtras - Additional fields for commit payload (e.g., {dbId})
 * @returns {Object} Result object with content or error
 */
async function _updateEntity(application, entityType, entityDbid, editFields, commitFields, commitPayloadExtras = {}) {
    if (!globalCookies) {
        globalCookies = await getCookiesFromServer(serverURL);
        if (!globalCookies) {
            console.error("Failed to retrieve cookies from server.");
            throw new Error("Failed to retrieve cookies.");
        }
        console.log("Received Cookies:", globalCookies);
    } else {
        console.log("Reusing Stored Cookies:", globalCookies);
    }

    // Step 1: PATCH with operation=Edit (simple fields structure)
    const editPayload = { fields: editFields };

    const editResponse = await fetch(`${serverURL}/ccmweb/rest/repos/${teamspaceID}/databases/${application}/records/${entityType}/${entityDbid}?operation=Edit&useDbid=true`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${personal_access_token_string}`,
            'Cookie': globalCookies
        },
        body: JSON.stringify(editPayload)
    });

    if (!editResponse.ok) {
        const errorText = await editResponse.text();
        throw new Error(`Edit operation failed: ${editResponse.status} ${errorText}`);
    }

    const editData = await editResponse.json();
    console.log("Edit response:", JSON.stringify(editData));

    // Step 2: PATCH with operation=Commit (full field structure with metadata)
    const commitPayload = {
        ...commitPayloadExtras,
        fields: commitFields
    };

    const commitResponse = await fetch(`${serverURL}/ccmweb/rest/repos/${teamspaceID}/databases/${application}/records/${entityType}/${entityDbid}?operation=Commit&useDbid=true`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${personal_access_token_string}`,
            'Cookie': globalCookies
        },
        body: JSON.stringify(commitPayload)
    });

    if (!commitResponse.ok) {
        const errorText = await commitResponse.text();
        throw new Error(`Commit operation failed: ${commitResponse.status} ${errorText}`);
    }

    return await commitResponse.json();
}

// Start the server
// Tool to get projects from Plan
server.tool(
    "get_available_projects",
    "Get the list of projects in Plan for a given application",
    {
        application: z.string().describe("Name of the plan application")
    },
    async ({ application }) => {
        try {
            if (!globalCookies) {
                globalCookies = await getCookiesFromServer(serverURL);
                if (!globalCookies) {
                    console.error("Failed to retrieve cookies from server.");
                    return { error: "Failed to retrieve cookies." };
                }
                console.log("Received Cookies:", globalCookies);
            } else {
                console.log("Reusing Stored Cookies:", globalCookies);
            }

            const queryPayload = {
                queryDef: {
                    primaryEntityDefName: "Project",
                    queryFieldDefs: [
                        { fieldPathName: "dbid", isShown: true, sortType: "SORT_DESC" },
                        { fieldPathName: "Name", isShown: true },
                        { fieldPathName: "DescriptionPT", isShown: true }
                    ],
                    filterNode: {
                        boolOp: "BOOL_OP_AND",
                        fieldFilters: [],
                        childFilterNodes: []
                    }
                },
                resultSetOptions: {}
            };

            const queryResponse = await fetch(`${serverURL}/ccmweb/rest/repos/${teamspaceID}/databases/${application}/query`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${personal_access_token_string}`,
                    'Cookie': globalCookies
                },
                body: JSON.stringify(queryPayload)
            });

            const queryData = await queryResponse.json();
            const resultSetId = queryData.result_set_id;

            if (!resultSetId) {
                throw new Error("Failed to retrieve result set ID");
            }

            const projectsResponse = await fetch(`${serverURL}/ccmweb/rest/repos/${teamspaceID}/databases/${application}/query/${resultSetId}?pageNumber=1`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${personal_access_token_string}`,
                    'Cookie': globalCookies
                }
            });

            const projectsData = await projectsResponse.json();

            if (projectsData && projectsData.rows) {
                const projectNames = projectsData.rows.map(row => row.displayName);
                return {
                    content: [{ type: 'text', text: `Projects retrieved: ${JSON.stringify(projectNames)}` }]
                };
            } else {
                throw new Error("Failed to retrieve projects");
            }
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error retrieving projects: ${e.message}` }]
            };
        }
    }
)

// Tool to get available components for a project in Plan
server.tool(
    "get_available_components",
    "Get the list of components for a project in Plan for a given application",
    {
        application: z.string().describe("Name of the application"),
        projectId: z.string().describe("ID of the project")
    },
    async ({ application, projectId }) => {
        try {
            if (!globalCookies) {
                globalCookies = await getCookiesFromServer(serverURL);
                if (!globalCookies) {
                    console.error("Failed to retrieve cookies from server.");
                    return { error: "Failed to retrieve cookies." };
                }
                console.log("Received Cookies:", globalCookies);
            } else {
                console.log("Reusing Stored Cookies:", globalCookies);
            }

            const queryPayload = {
                queryDef: {
                    primaryEntityDefName: "Component",
                    queryFieldDefs: [
                        { fieldPathName: "Name", isShown: true, sortOrder: 0 },
                        { fieldPathName: "dbid", isShown: true, sortOrder: 0 },
                        { fieldPathName: "record_type", isShown: true, sortOrder: 0 }
                    ],
                    filterNode: {
                        boolOp: "BOOL_OP_AND",
                        fieldFilters: [],
                        childFilterNodes: []
                    }
                },
                resultSetOptions: {
                    convertToLocalTime: false,
                    maxResultSetRows: 10000,
                    pageSize: 10000
                }
            };

            const queryResponse = await fetch(`${serverURL}/ccmweb/rest/repos/${teamspaceID}/databases/${application}/query`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${personal_access_token_string}`,
                    'Cookie': globalCookies
                },
                body: JSON.stringify(queryPayload)
            });

            const queryData = await queryResponse.json();
            const resultSetId = queryData.result_set_id;

            if (!resultSetId) {
                throw new Error("Failed to retrieve result set ID");
            }

            const componentsResponse = await fetch(`${serverURL}/ccmweb/rest/repos/${teamspaceID}/databases/${application}/query/${resultSetId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${personal_access_token_string}`,
                    'Cookie': globalCookies
                }
            });

            const componentsData = await componentsResponse.json();
            
            if (componentsData && componentsData.rows) {
                const componentNames = componentsData.rows.map(row => row.displayName);
                return {
                    content: [{ type: 'text', text: `Components retrieved: ${JSON.stringify(componentNames)}` }]
                };
            } else if( componentsData.length === 0) {
                return {
                    content: [{ type: 'text', text: `Components retrieved: ${JSON.stringify("[]")}` }]
                };
            }
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Components retrieved: ${JSON.stringify("[]")}` }]
            };
        }
    }
)

// Tool to get sprints for an application in Plan
server.tool(
    "get_sprints",
    "Get the list of sprints in Plan for a given application",
    {
        application: z.string().describe("Name of the application")
    },
    async ({ application }) => {
        try {
            if (!globalCookies) {
                globalCookies = await getCookiesFromServer(serverURL);
                if (!globalCookies) {
                    console.error("Failed to retrieve cookies from server.");
                    return { error: "Failed to retrieve cookies." };
                }
                console.log("Received Cookies:", globalCookies);
            } else {
                console.log("Reusing Stored Cookies:", globalCookies);
            }

            const queryPayload = {
                queryDef: {
                    primaryEntityDefName: "Sprint",
                    queryFieldDefs: [
                        { fieldPathName: "Name", isShown: true, sortOrder: 0 },
                        { fieldPathName: "StartDate", isShown: true, sortOrder: 0 },
                        { fieldPathName: "EndDate", isShown: true, sortOrder: 0 },
                        { fieldPathName: "dbid", isShown: true, sortOrder: 0 },
                        { fieldPathName: "record_type", isShown: true, sortOrder: 0 }
                    ],
                    filterNode: {
                        boolOp: "BOOL_OP_AND",
                        fieldFilters: [],
                        childFilterNodes: []
                    }
                },
                resultSetOptions: {
                    convertToLocalTime: false,
                    maxResultSetRows: 10000,
                    pageSize: 10000
                }
            };

            const queryResponse = await fetch(`${serverURL}/ccmweb/rest/repos/${teamspaceID}/databases/${application}/query`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${personal_access_token_string}`,
                    'Cookie': globalCookies
                },
                body: JSON.stringify(queryPayload)
            });

            const queryData = await queryResponse.json();
            const resultSetId = queryData.result_set_id;

            if (!resultSetId) {
                throw new Error(`Failed to retrieve result set ID. Response: ${JSON.stringify(queryData)}`);
            }

            const sprintsResponse = await fetch(`${serverURL}/ccmweb/rest/repos/${teamspaceID}/databases/${application}/query/${resultSetId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${personal_access_token_string}`,
                    'Cookie': globalCookies
                }
            });

            const sprintsData = await sprintsResponse.json();

            if (sprintsData && sprintsData.rows) {
                return {
                    content: [{ type: 'text', text: `Sprints retrieved: ${JSON.stringify(sprintsData)}` }]
                };
            } else {
                throw new Error("Failed to retrieve sprints");
            }
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error retrieving sprints: ${e.message}` }]
            };
        }
    }
)

// Tool to get releases for an application in Plan
server.tool(
    "get_releases",
    "Get the list of releases in Plan for a given application",
    {
        application: z.string().describe("Name of the application")
    },
    async ({ application }) => {
        try {
            if (!globalCookies) {
                globalCookies = await getCookiesFromServer(serverURL);
                if (!globalCookies) {
                    console.error("Failed to retrieve cookies from server.");
                    return { error: "Failed to retrieve cookies." };
                }
                console.log("Received Cookies:", globalCookies);
            } else {
                console.log("Reusing Stored Cookies:", globalCookies);
            }

            const queryPayload = {
                queryDef: {
                    primaryEntityDefName: "Release",
                    queryFieldDefs: [
                        { fieldPathName: "Name", isShown: true, sortOrder: 0 },
                        { fieldPathName: "ReleaseType", isShown: true, sortOrder: 0 },
                        { fieldPathName: "dbid", isShown: true, sortOrder: 0 },
                        { fieldPathName: "record_type", isShown: true, sortOrder: 0 },
                        { fieldPathName: "Sprints", isShown: true, sortOrder: 0 }
                    ],
                    filterNode: {
                        boolOp: "BOOL_OP_AND",
                        fieldFilters: [],
                        childFilterNodes: []
                    }
                },
                resultSetOptions: {
                    convertToLocalTime: false,
                    maxResultSetRows: 10000,
                    pageSize: 10000
                }
            };

            const queryResponse = await fetch(`${serverURL}/ccmweb/rest/repos/${teamspaceID}/databases/${application}/query`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${personal_access_token_string}`,
                    'Cookie': globalCookies
                },
                body: JSON.stringify(queryPayload)
            });

            const queryData = await queryResponse.json();
            const resultSetId = queryData.result_set_id;

            if (!resultSetId) {
                throw new Error(`Failed to retrieve result set ID. Response: ${JSON.stringify(queryData)}`);
            }

            const releasesResponse = await fetch(`${serverURL}/ccmweb/rest/repos/${teamspaceID}/databases/${application}/query/${resultSetId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${personal_access_token_string}`,
                    'Cookie': globalCookies
                }
            });

            const releasesData = await releasesResponse.json();

            if (releasesData && releasesData.rows) {
                return {
                    content: [{ type: 'text', text: `Releases retrieved: ${JSON.stringify(releasesData)}` }]
                };
            } else {
                throw new Error("Failed to retrieve releases");
            }
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error retrieving releases: ${e.message}` }]
            };
        }
    }
)

// Tool to create or update a sprint
server.tool(
    "create_or_update_sprint",
    "Creates a new sprint or updates an existing sprint in Plan. If sprintDbid is provided, updates the sprint; otherwise creates a new one.",
    {
        application: z.string().describe("Name of the application"),
        sprintDbid: z.string().optional().describe("The dbid of the sprint to update (optional - omit to create new sprint)"),
        name: z.string().optional().describe("Name of the sprint (required for creation, optional for update)"),
        startDate: z.string().optional().describe("Start date in YYYY-MM-DD format (optional)"),
        endDate: z.string().optional().describe("End date in YYYY-MM-DD format (optional)")
    },
    async ({ application, sprintDbid, name, startDate, endDate }) => {
        try {
            if (!globalCookies) {
                globalCookies = await getCookiesFromServer(serverURL);
                if (!globalCookies) {
                    console.error("Failed to retrieve cookies from server.");
                    return { error: "Failed to retrieve cookies." };
                }
                console.log("Received Cookies:", globalCookies);
            } else {
                console.log("Reusing Stored Cookies:", globalCookies);
            }

            let targetDbid = sprintDbid;
            const isCreating = !sprintDbid;

            // CREATE MODE: Step 1 - POST to create empty Sprint
            if (isCreating) {
                if (!name) {
                    throw new Error("Name is required when creating a new sprint");
                }

                const createResponse = await fetch(`${serverURL}/ccmweb/rest/repos/${teamspaceID}/databases/${application}/records/Sprint?operation=Edit&useDbid=true`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Basic ${personal_access_token_string}`,
                        'Cookie': globalCookies
                    },
                    body: JSON.stringify({ fields: [] })
                });

                if (!createResponse.ok) {
                    const errorText = await createResponse.text();
                    throw new Error(`Create operation failed: ${createResponse.status} ${errorText}`);
                }

                const createData = await createResponse.json();
                targetDbid = createData.dbId;
                console.log("Created Sprint with dbId:", targetDbid);
            } else {
                // UPDATE MODE: Validate at least one field to update
                if (!name && !startDate && !endDate) {
                    throw new Error("At least one of name, startDate, or endDate must be provided for update");
                }
            }

            // Step 2: PATCH Edit to set fields
            const editFields = [];
            if (name) {
                editFields.push({ name: "Name", value: name });
            }
            if (startDate) {
                editFields.push({ name: "StartDate", value: startDate });
            }
            if (endDate) {
                editFields.push({ name: "EndDate", value: endDate });
            }

            const editPayload = { fields: editFields };

            const editResponse = await fetch(`${serverURL}/ccmweb/rest/repos/${teamspaceID}/databases/${application}/records/Sprint/${targetDbid}?operation=Edit&useDbid=true`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${personal_access_token_string}`,
                    'Cookie': globalCookies
                },
                body: JSON.stringify(editPayload)
            });

            if (!editResponse.ok) {
                const errorText = await editResponse.text();
                throw new Error(`Edit operation failed: ${editResponse.status} ${errorText}`);
            }

            const editData = await editResponse.json();
            console.log("Edit response:", JSON.stringify(editData));

            // Step 3: PATCH Commit with full field metadata
            const commitFields = [];
            
            if (name) {
                commitFields.push({
                    name: "Name",
                    value: name,
                    valueStatus: "HAS_VALUE",
                    validationStatus: "_KNOWN_VALID",
                    requiredness: "MANDATORY",
                    requirednessForUser: "MANDATORY",
                    type: "SHORT_STRING",
                    valueAsList: [name],
                    messageText: "",
                    maxLength: 254
                });
            }

            if (startDate) {
                commitFields.push({
                    name: "StartDate",
                    value: `${startDate} 00:00:00`,
                    valueStatus: "HAS_VALUE",
                    validationStatus: "_KNOWN_VALID",
                    requiredness: "MANDATORY",
                    requirednessForUser: "MANDATORY",
                    type: "DATE_TIME",
                    valueAsList: [`${startDate} 00:00:00`],
                    messageText: "",
                    maxLength: 0
                });
            }

            if (endDate) {
                commitFields.push({
                    name: "EndDate",
                    value: `${endDate} 00:00:00`,
                    valueStatus: "HAS_VALUE",
                    validationStatus: "_KNOWN_VALID",
                    requiredness: "MANDATORY",
                    requirednessForUser: "MANDATORY",
                    type: "DATE_TIME",
                    valueAsList: [`${endDate} 00:00:00`],
                    messageText: "",
                    maxLength: 0
                });
            }

            const commitPayload = {
                dbId: targetDbid,
                fields: commitFields
            };

            const commitResponse = await fetch(`${serverURL}/ccmweb/rest/repos/${teamspaceID}/databases/${application}/records/Sprint/${targetDbid}?operation=Commit&useDbid=true`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${personal_access_token_string}`,
                    'Cookie': globalCookies
                },
                body: JSON.stringify(commitPayload)
            });

            if (!commitResponse.ok) {
                const errorText = await commitResponse.text();
                throw new Error(`Commit operation failed: ${commitResponse.status} ${errorText}`);
            }

            const commitData = await commitResponse.json();

            const action = isCreating ? "created" : "updated";
            return {
                content: [{ type: 'text', text: `Sprint ${action} successfully: ${JSON.stringify(commitData)}` }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error ${sprintDbid ? 'updating' : 'creating'} sprint: ${e.message}` }]
            };
        }
    }
)

// Tool to create or update a release
server.tool(
    "create_or_update_release",
    "Creates a new release or updates an existing release in Plan. If releaseDbid is provided, updates the release; otherwise creates a new one.",
    {
        application: z.string().describe("Name of the application"),
        releaseDbid: z.string().optional().describe("The dbid of the release to update (optional - omit to create new release)"),
        fields: z.array(z.object({
            name: z.string().describe("Field name (e.g., 'Name', 'ReleaseType', 'Description', 'Frozen', 'Sprints', etc.)"),
            value: z.string().describe("The new value for the field"),
            type: z.string().optional().describe("Field type (e.g., 'SHORT_STRING', 'MULTILINE_STRING', 'REFERENCE_LIST', 'DATE_TIME'). Defaults to 'SHORT_STRING'.")
        })).describe("Array of fields to set/update. For creation, 'Name' is required.")
    },
    async ({ application, releaseDbid, fields }) => {
        try {
            if (!globalCookies) {
                globalCookies = await getCookiesFromServer(serverURL);
                if (!globalCookies) {
                    console.error("Failed to retrieve cookies from server.");
                    return { error: "Failed to retrieve cookies." };
                }
                console.log("Received Cookies:", globalCookies);
            } else {
                console.log("Reusing Stored Cookies:", globalCookies);
            }

            let targetDbid = releaseDbid;
            const isCreating = !releaseDbid;

            // CREATE MODE: Step 1 - POST to create empty Release
            if (isCreating) {
                const hasName = fields.some(f => f.name === "Name");
                if (!hasName) {
                    throw new Error("Name field is required when creating a new release");
                }

                const createResponse = await fetch(`${serverURL}/ccmweb/rest/repos/${teamspaceID}/databases/${application}/records/Release?operation=Edit&useDbid=true`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Basic ${personal_access_token_string}`,
                        'Cookie': globalCookies
                    },
                    body: JSON.stringify({ fields: [] })
                });

                if (!createResponse.ok) {
                    const errorText = await createResponse.text();
                    throw new Error(`Create operation failed: ${createResponse.status} ${errorText}`);
                }

                const createData = await createResponse.json();
                targetDbid = createData.dbId;
                console.log("Created Release with dbId:", targetDbid);
            } else {
                if (fields.length === 0) {
                    throw new Error("At least one field must be provided for update");
                }
            }

            // Step 2: PATCH Edit to set fields (may need multiple calls)
            for (const field of fields) {
                // For REFERENCE_LIST fields, we need to send valueAsList instead of value
                const fieldPayload = { name: field.name };
                if (field.type === "REFERENCE_LIST") {
                    fieldPayload.valueAsList = field.value.split(',').map(v => v.trim());
                } else {
                    fieldPayload.value = field.value;
                }
                
                const editPayload = { fields: [fieldPayload] };

                const editResponse = await fetch(`${serverURL}/ccmweb/rest/repos/${teamspaceID}/databases/${application}/records/Release/${targetDbid}?operation=Edit&useDbid=true`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Basic ${personal_access_token_string}`,
                        'Cookie': globalCookies
                    },
                    body: JSON.stringify(editPayload)
                });

                if (!editResponse.ok) {
                    const errorText = await editResponse.text();
                    throw new Error(`Edit operation failed for ${field.name}: ${editResponse.status} ${errorText}`);
                }

                const editData = await editResponse.json();
                //console.log(`Edit response for ${field.name}:`, JSON.stringify(editData));
            }

            // Step 3: PATCH Commit with full field metadata
            const commitFields = fields.map(field => {
                const baseField = {
                    name: field.name,
                    valueStatus: "HAS_VALUE",
                    validationStatus: "_KNOWN_VALID",
                    requiredness: field.name === "Name" ? "MANDATORY" : "OPTIONAL",
                    requirednessForUser: field.name === "Name" ? "MANDATORY" : "OPTIONAL",
                    type: field.type || "SHORT_STRING",
                    messageText: "",
                    maxLength: (field.type === "MULTILINE_STRING" || field.type === "REFERENCE_LIST") ? 0 : 254
                };

                // Handle REFERENCE_LIST type (like Sprints)
                if (field.type === "REFERENCE_LIST") {
                    baseField.valueAsList = field.value.split(',').map(v => v.trim());
                    // For REFERENCE_LIST, join values with newline for the value field
                    baseField.value = baseField.valueAsList.join('\n');
                } else {
                    baseField.value = field.value;
                    baseField.valueAsList = [field.value];
                }

                return baseField;
            });

            const commitPayload = {
                dbId: targetDbid,
                fields: commitFields
            };

            const commitResponse = await fetch(`${serverURL}/ccmweb/rest/repos/${teamspaceID}/databases/${application}/records/Release/${targetDbid}?operation=Commit&useDbid=true`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${personal_access_token_string}`,
                    'Cookie': globalCookies
                },
                body: JSON.stringify(commitPayload)
            });

            if (!commitResponse.ok) {
                const errorText = await commitResponse.text();
                throw new Error(`Commit operation failed: ${commitResponse.status} ${errorText}`);
            }

            const commitData = await commitResponse.json();

            const action = isCreating ? "created" : "updated";
            return {
                content: [{ type: 'text', text: `Release ${action} successfully: ${JSON.stringify(commitData)}` }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error ${releaseDbid ? 'updating' : 'creating'} release: ${e.message}` }]
            };
        }
    }
)

// Tool to get available work item types for a project in Plan
server.tool(
    "get_available_workitem_types",
    "Get the available workitem types for a project in Plan for a given application",
    {
        application: z.string().describe("Name of the application"),
        projectId: z.string().describe("ID of the project")
    },
    async ({ application }) => {
        try {
            if (!globalCookies) {
                globalCookies = await getCookiesFromServer(serverURL);
                if (!globalCookies) {
                    console.error("Failed to retrieve cookies from server.");
                    return { error: "Failed to retrieve cookies." };
                }
                console.log("Received Cookies:", globalCookies);
            } else {
                console.log("Reusing Stored Cookies:", globalCookies);
            }

            const queryPayload = {
                queryDef: {
                    primaryEntityDefName: "Project",
                    queryFieldDefs: [
                        { fieldPathName: "dbid", isShown: true, sortType: "SORT_DESC" },
                        { fieldPathName: "Name", isShown: true },
                        { fieldPathName: "WITypeList", isShown: true }
                    ],
                    filterNode: {
                        boolOp: "BOOL_OP_AND",
                        fieldFilters: [],
                        childFilterNodes: []
                    }
                },
                resultSetOptions: {}
            };

            const queryResponse = await fetch(`${serverURL}/ccmweb/rest/repos/${teamspaceID}/databases/${application}/query`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${personal_access_token_string}`,
                    'Cookie': globalCookies
                },
                body: JSON.stringify(queryPayload)
            });

            const queryData = await queryResponse.json();
            const resultSetId = queryData.result_set_id;

            if (!resultSetId) {
                throw new Error("Failed to retrieve result set ID");
            }

            const workItemTypesResponse = await fetch(`${serverURL}/ccmweb/rest/repos/${teamspaceID}/databases/${application}/query/${resultSetId}?pageNumber=1`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${personal_access_token_string}`,
                    'Cookie': globalCookies
                }
            });

            const workItemTypesData = await workItemTypesResponse.json();

            if (workItemTypesData && workItemTypesData.rows) {
                const workItemTypes = workItemTypesData.rows.map(row => {
                    const typesString = row.values[2]; // Assuming WITypeList is at index 2
                    return typesString.split('\n').map(type => type.trim());
                }).flat();

                return {
                    content: [{ type: 'text', text: `Available work item types: ${JSON.stringify(workItemTypes)}` }]
                };
            } else {
                throw new Error("Failed to retrieve work item types");
            }
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error retrieving work item types: ${e.message}` }]
            };
        }
    }
)

// Tool to create a work item in Plan
server.tool(
    "create_work_item",
    "Creates a new work item in Plan",
    {
        component: z.string().optional().describe("An optional component name if any are available in the project, this is not required."),
        title: z.string().describe("Title of the work item"),
        description: z.string().describe("Description of the work item"),
        workItemType: z.string().describe("Type of the work item from the list of available work item types"),
        application: z.string().describe("Name of the application"),
        projectId: z.string().describe("ID of the project")
    },
    async ({component, title, description, workItemType, application, projectId }) => {
        try {
            if (!globalCookies) {
                globalCookies = await getCookiesFromServer(serverURL);
                if (!globalCookies) {
                    console.error("Failed to retrieve cookies from server.");
                    return { error: "Failed to retrieve cookies." };
                }
                console.log("Received Cookies:", globalCookies);
            } else {
                console.log("Reusing Stored Cookies:", globalCookies);
            }
            let bodyJSON = JSON.parse(createWorkItemBody);
            if(component !== undefined){
                // Use empty string if not provided
                bodyJSON.fields[0].value = component || "";
                bodyJSON.fields[0].valueAsList[0] = component || "";
            } 
            bodyJSON.fields[2].value = projectId;
            bodyJSON.fields[2].valueAsList[0] = projectId;
            bodyJSON.fields[4].value = title;
            bodyJSON.fields[4].valueAsList[0] = title;
            bodyJSON.fields[5].value = description;
            bodyJSON.fields[5].valueAsList[0] = description;
            bodyJSON.fields[6].value = workItemType;
            bodyJSON.fields[6].valueAsList[0] = workItemType;
            let body = JSON.stringify(bodyJSON);

            const response = await fetch(`${serverURL}/ccmweb/rest/repos/${teamspaceID}/databases/${application}/records/WorkItem/?operation=Commit&useDbid=false`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Basic ${personal_access_token_string}`,
                    'Cookie': globalCookies
                },
                body: body
            });

            const data = await response.json();
            if (data.viewURL) {
                return {
                    content: [{ type: 'text', text: `Work item created successfully. dbId: ${data.dbId}. View it at: ${serverURL}/#${data.viewURL}` }]
                };
            } else {
                throw new Error("Failed to create work item");
            }
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error creating work item: ${e.message}` }]
            };
        }
    }
);

// Tool to retrieve all work items for a project
server.tool(
    "get_work_items",
    "Retrieves all work items for a given application, can filter by work item type and specific owner",
    {
        applicationName: z.string().describe("Name of the application"),
        projectId: z.string().describe("ID of the project"),
        workitemType: z.string().optional().describe("Type of the work item to filter by, if any"),
        owner: z.string().optional().describe("Filter the workitems by owner, if any")
    },
    async ({ applicationName, projectId, workitemType, owner }) => {
        try {
            if (!globalCookies) {
                globalCookies = await getCookiesFromServer(serverURL);
                if (!globalCookies) {
                    console.error("Failed to retrieve cookies from server.");
                    return { error: "Failed to retrieve cookies." };
                }
                console.log("Received Cookies:", globalCookies); // Print cookies after receiving
            } else {
                console.log("Reusing Stored Cookies:", globalCookies); // Print when reusing stored cookies
            }
            console.log(`${serverURL}/ccmweb/rest/repos/${teamspaceID}/databases/${applicationName}/query`);
            // First API call to get result_set_id
            const queryPayload = {
                queryDef: {
                    primaryEntityDefName: "WorkItem",
                    stateDriven: true,
                    showWipLimits: true,
                    backlogStateName:"Backlog",
                    laneQueryDef: {
                        pageCounterQueryField: "State",
                        pageCounterQueryFieldPath: "State",
                        wipLimitFilterQueryField: "Project"
                    },
                    primaryEntityDefName: "WorkItem",
                    queryFieldDefs: [
                        { fieldPathName: "dbid", isShown: true },
                        { fieldPathName: "State", isShown: true },
                        { fieldPathName: "id", isShown: true },
                        { fieldPathName: "Title", isShown: true },
                        { fieldPathName: "Owner.fullname", isShown: true },
                        { fieldPathName: "Owner", isShown: true },
                        { fieldPathName: "Priority", isShown: true },
                        { fieldPathName: "Parent.Title", isShown: true },
                        { fieldPathName: "Parent", isShown: true },
                        { fieldPathName: "Parent.record_type", isShown: true },
                        { fieldPathName: "Tags", isShown: true },
                        { fieldPathName: "WIType", isShown: true },
                        { fieldPathName: "Sprint", isShown: true },
                        { fieldPathName: "PlannedRelease", isShown: true },
                        { fieldPathName: "FoundInRelease", isShown: true }
                    ],
                    filterNode: {
                        boolOp: "BOOL_OP_AND",
                        fieldFilters: [
                            { fieldPath: "Project", compOp: "COMP_OP_EQ", values: [projectId] },
                            ...(owner ? [{ fieldPath: "Owner", compOp: "COMP_OP_EQ", values: ["[CURRENT_USER]"] }] : []),
                            ...(workitemType ? [{ fieldPath: "WIType", compOp: "COMP_OP_EQ", values: [workitemType] }] : [])
                        ]
                    }
                },
                resultSetOptions: {
                    pageSize: 300,
                    convertToLocalTime: true
                }
            };

            const queryResponse = await fetch(`${serverURL}/ccmweb/rest/repos/${teamspaceID}/databases/${applicationName}/query`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${personal_access_token_string}`,
                    'Cookie': globalCookies
                },
                body: JSON.stringify(queryPayload)
            });

            const queryData = await queryResponse.json();
            const resultSetId = queryData.result_set_id;

            if (!resultSetId) {
                throw new Error(`Failed to retrieve result set ID. Response: ${JSON.stringify(queryData)}`);
            }

            // Second API call to fetch work items
            const workItemsResponse = await fetch(`${serverURL}/ccmweb/rest/repos/${teamspaceID}/databases/${applicationName}/query/${resultSetId}?pageNumber=1`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${personal_access_token_string}`,
                    'Cookie': globalCookies
                }
            });

            const workItemsData = await workItemsResponse.json();

            if (workItemsData) {
                return {
                    content: [{ type: 'text', text: `Work items retrieved: ${JSON.stringify(workItemsData)}` }]
                };
            } else {
                throw new Error("Failed to retrieve work items");
            }
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error retrieving work items: ${e.message}` }]
            };
        }
    }
);

// Tool to delete a work item
server.tool(
    "delete_work_item",
    "Deletes a work item in Plan",
    {
        dbid: z.string().describe("The dbid field from the workitem to identify it, this is the first field returned for each workitem in the get_work_items tool."),
        application: z.string().describe("Name of the application")
    },
    async ({ dbid, application }) => {
        try {
            if (!globalCookies) {
                globalCookies = await getCookiesFromServer(serverURL);
                if (!globalCookies) {
                        console.error("Failed to retrieve cookies from server.");
                        return { error: "Failed to retrieve cookies." };
                    }
                    console.log("Received Cookies:", globalCookies); // Print cookies after receiving
            } else {
                console.log("Reusing Stored Cookies:", globalCookies); // Print when reusing stored cookies
            }
            const response = await fetch(`${serverURL}/ccmweb/rest/repos/${teamspaceID}/databases/${application}/records/WorkItem/${dbid}?actionName=Delete&useDbid=true`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${personal_access_token_string}`,
                    'Cookie': globalCookies
                }
            });

            if (response.ok) {
                return {
                    content: [{ type: 'text', text: `Work item ${dbid} deleted successfully` }]
                };
            } else {
                throw new Error("Failed to delete work item");
            }
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error deleting work item: ${e.message}` }]
            };
        }
    }
);

// Tool to update a work item
server.tool(
    "update_work_item",
    "Updates fields of an existing work item. Provide the fields you want to update with their new values.",
    {
        dbid: z.string().describe("The dbid field from the workitem to identify it"),
        application: z.string().describe("Name of the application"),
        fields: z.array(z.object({
            name: z.string().describe("Field name (e.g., 'Description', 'Owner', 'Component', 'Sprint', 'StoryPoints', 'BusinessValue', etc.)"),
            value: z.string().describe("The new value for the field"),
            type: z.string().optional().describe("Field type (e.g., 'SHORT_STRING', 'MULTILINE_STRING', 'INT', 'REFERENCE', 'DATE_TIME'). Defaults to 'SHORT_STRING'."),
        })).describe("Array of fields to update"),
    },
    async ({ dbid, application, fields }) => {
        try {
            if (!globalCookies) {
                globalCookies = await getCookiesFromServer(serverURL);
                if (!globalCookies) {
                    console.error("Failed to retrieve cookies from server.");
                    return { error: "Failed to retrieve cookies." };
                }
                console.log("Received Cookies:", globalCookies);
            } else {
                console.log("Reusing Stored Cookies:", globalCookies);
            }

            // Step 1: Modify action + Edit operation with empty body (like UI does)
            const modifyUrl = `${serverURL}/ccmweb/rest/repos/${teamspaceID}/databases/${application}/records/WorkItem/${dbid}?actionName=Modify&operation=Edit&useDbid=true`;
            
            const modifyResponse = await fetch(modifyUrl, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Basic ${personal_access_token_string}`,
                    'Cookie': globalCookies
                },
                body: "{}"
            });

            if (!modifyResponse.ok) {
                const errorText = await modifyResponse.text();
                throw new Error(`Modify action failed: ${modifyResponse.statusText} - ${errorText}`);
            }

            console.log("Modify action successful");

            // Step 2: Edit operation with simple field structure (name and value only)
            const editBody = {
                fields: fields.map(field => ({
                    name: field.name,
                    value: field.value
                }))
            };

            const editUrl = `${serverURL}/ccmweb/rest/repos/${teamspaceID}/databases/${application}/records/WorkItem/${dbid}?operation=Edit&useDbid=true`;
            
            const editResponse = await fetch(editUrl, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Basic ${personal_access_token_string}`,
                    'Cookie': globalCookies
                },
                body: JSON.stringify(editBody)
            });

            if (!editResponse.ok) {
                const errorText = await editResponse.text();
                throw new Error(`Edit operation failed: ${editResponse.statusText} - ${errorText}`);
            }

            const editData = await editResponse.json();
            console.log("Edit operation successful");

            // Step 3: Commit operation with full field structure
            const commitBody = {
                dbId: dbid,
                fields: fields.map(field => ({
                    name: field.name,
                    value: field.value,
                    valueStatus: field.value ? "HAS_VALUE" : "HAS_NO_VALUE",
                    validationStatus: "_KNOWN_VALID",
                    requiredness: "OPTIONAL",
                    requirednessForUser: "OPTIONAL",
                    type: field.type || "SHORT_STRING",
                    valueAsList: field.value ? [field.value] : [],
                    messageText: "",
                    maxLength: field.type === "SHORT_STRING" ? 254 : 0
                }))
            };

            const commitUrl = `${serverURL}/ccmweb/rest/repos/${teamspaceID}/databases/${application}/records/WorkItem/${dbid}?operation=Commit&useDbid=true`;
            
            const commitResponse = await fetch(commitUrl, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Basic ${personal_access_token_string}`,
                    'Cookie': globalCookies
                },
                body: JSON.stringify(commitBody)
            });

            if (commitResponse.ok) {
                const result = await commitResponse.json();
                const updatedFields = fields.map(f => `- ${f.name}: ${f.value}`).join('\n');
                return {
                    content: [{ type: 'text', text: `Work item ${dbid} updated successfully.\n\nUpdated fields:\n${updatedFields}` }]
                };
            } else {
                const errorText = await commitResponse.text();
                throw new Error(`Commit operation failed: ${commitResponse.statusText} - ${errorText}`);
            }
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error updating work item: ${e.message}` }]
            };
        }
    }
);

//Tool to retrieve all applications from Plan
server.tool(
    "get_applications",
    "Retrieves all applications from the Plan system",
    {},
    async () => {
        try {
            if (!globalCookies) {
                globalCookies = await getCookiesFromServer(serverURL);
                if (!globalCookies) {
                    console.error("Failed to retrieve cookies from server.");
                    return { error: "Failed to retrieve cookies." };
                }
                console.log("Received Cookies:", globalCookies); // Print cookies after receiving
            } else {
                console.log("Reusing Stored Cookies:", globalCookies); // Print when reusing stored cookies
            }
            const response = await fetch(`${serverURL}/ccmweb/rest/repos/${teamspaceID}/databases`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Basic ${personal_access_token_string}`,
                    'Cookie': globalCookies
                }
            });

            const data = await response.json();

            if (data && Array.isArray(data)) {
                const applications = data.map(app => ({
                    id: app.dbId,
                    applicationName: app.name
                }));

                return {
                    content: [
                        { type: 'text', text: `Applications retrieved: ${JSON.stringify(applications)}` }
                    ]
                };
            } else {
                throw new Error("Failed to retrieve applications");
            }
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error retrieving applications: ${e.message}` }]
            };
        }
    }
);

// Tool to get available states for work items
// Tool to get available state transitions for work items
server.tool(
    "get_available_states",
    "Gets the state transition matrix for work items in Plan for a given application, showing available transitions/actions",
    {
        application: z.string().describe("Name of the application")
    },
    async ({ application }) => {
        try {
            if (!globalCookies) {
                globalCookies = await getCookiesFromServer(serverURL);
                if (!globalCookies) {
                    console.error("Failed to retrieve cookies from server.");
                    return { error: "Failed to retrieve cookies." };
                }
                console.log("Received Cookies:", globalCookies);
            } else {
                console.log("Reusing Stored Cookies:", globalCookies);
            }
            
            const response = await fetch(`${serverURL}/ccmweb/rest/repos/${teamspaceID}/databases/${application}/records/WorkItem`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json, text/plain, */*',
                    'Authorization': `Basic ${personal_access_token_string}`,
                    'Cookie': globalCookies
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to get state transition matrix with status ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            
            // Format the response to make it more readable
            let formattedResponse = "State Transition Matrix:\n\n";
            
            if (data && Array.isArray(data)) {
                // Extract state transitions from work items with _CHANGE_STATE actions
                const stateTransitions = {};
                
                data.forEach(workItem => {
                    if (workItem.actions && Array.isArray(workItem.actions)) {
                        workItem.actions.forEach(action => {
                            if (action.actionType === "_CHANGE_STATE") {
                                const actionName = action.name;
                                const destState = action.actionDestStateName;
                                const sourceStates = action.actionSourceStateNames || [];
                                
                                sourceStates.forEach(sourceState => {
                                    if (!stateTransitions[sourceState]) {
                                        stateTransitions[sourceState] = [];
                                    }
                                    
                                    // Avoid duplicates
                                    const existingTransition = stateTransitions[sourceState].find(
                                        t => t.action === actionName && t.toState === destState
                                    );
                                    
                                    if (!existingTransition) {
                                        stateTransitions[sourceState].push({
                                            action: actionName,
                                            toState: destState
                                        });
                                    }
                                });
                            }
                        });
                    }
                });
                
                // Format the extracted transitions
                if (Object.keys(stateTransitions).length > 0) {
                    for (const [fromState, transitions] of Object.entries(stateTransitions)) {
                        formattedResponse += `From "${fromState}":\n`;
                        transitions.forEach(transition => {
                            formattedResponse += `  - Action: "${transition.action}" -> To: "${transition.toState}"\n`;
                        });
                        formattedResponse += "\n";
                    }
                } else {
                    formattedResponse += "No state transitions found in the work items.\n";
                }
            } else {
                formattedResponse += "Unexpected response format. Raw data:\n";
                formattedResponse += JSON.stringify(data, null, 2);
            }
            
            return {
                content: [{ 
                    type: 'text', 
                    text: `${formattedResponse}\n\nRaw data: ${JSON.stringify(data)}` 
                }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error retrieving state transition matrix: ${e.message}` }]
            };
        }
    }
);

// Tool to change work item state
server.tool(
    "change_work_item_state",
    "Changes the state of a work item in Plan using a two-step process (movement request + commit)",
    {
        dbid: z.string().describe("The dbid field from the workitem to identify it, this is the first field returned for each workitem in the get_work_items tool, or from the create_work_item tool as the dbId field."),
        application: z.string().describe("Name of the application"),
        targetState: z.string().describe("The target state to transition the work item to (e.g., 'Resolve', 'Close', 'Reopen', etc.)")
    },
    async ({ dbid, application, targetState }) => {
        try {
            if (!globalCookies) {
                globalCookies = await getCookiesFromServer(serverURL);
                if (!globalCookies) {
                    console.error("Failed to retrieve cookies from server.");
                    return { error: "Failed to retrieve cookies." };
                }
                console.log("Received Cookies:", globalCookies);
            } else {
                console.log("Reusing Stored Cookies:", globalCookies);
            }

            // First, get the current work item data
            const getCurrentUrl = `${serverURL}/ccmweb/rest/repos/${teamspaceID}/databases/${application}/records/WorkItem/${dbid}?useDbid=true`;
            
            const getCurrentResponse = await fetch(getCurrentUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${personal_access_token_string}`,
                    'Cookie': globalCookies
                }
            });

            if (!getCurrentResponse.ok) {
                const errorText = await getCurrentResponse.text();
                throw new Error(`Failed to get current work item data with status ${getCurrentResponse.status}: ${errorText}`);
            }

            const currentWorkItem = await getCurrentResponse.json();
            
            // Step 1: Make the movement request with minimal body
            const movementUrl = `${serverURL}/ccmweb/rest/repos/${teamspaceID}/databases/${application}/records/WorkItem/${dbid}?actionName=${targetState}&operation=Edit&useDbid=true`;
            
            const movementResponse = await fetch(movementUrl, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${personal_access_token_string}`,
                    'Cookie': globalCookies
                },
                body: "{}"  // Minimal body like in browser
            });

            if (!movementResponse.ok) {
                const errorText = await movementResponse.text();
                throw new Error(`Movement request failed with status ${movementResponse.status}: ${errorText}`);
            }

            const movementData = await movementResponse.json();
            console.log("Movement request successful:", movementData);

            // Wait 1 second before commit to allow database updates to complete
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Step 2: Commit the change with minimal body (like browser)
            const commitUrl = `${serverURL}/ccmweb/rest/repos/${teamspaceID}/databases/${application}/records/WorkItem/${dbid}?operation=Commit&useDbid=true`;
            
            // Use the same minimal commit body structure as the browser
            const commitBody = {
                "dbId": movementData.dbId,
                "fields": []
            };
            
            const commitResponse = await fetch(commitUrl, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${personal_access_token_string}`,
                    'Cookie': globalCookies
                },
                body: JSON.stringify(commitBody)
            });

            if (!commitResponse.ok) {
                const errorText = await commitResponse.text();
                throw new Error(`Commit request failed with status ${commitResponse.status}: ${errorText}`);
            }

            const commitData = await commitResponse.json();
            //console.log("Commit request successful:", commitData);

            return {
                content: [{ 
                    type: 'text', 
                    text: `Work item ${dbid} state successfully changed to '${targetState}'. Both movement and commit operations completed successfully.` 
                }]
            };

        } catch (e) {
            // Handle specific state transition errors
            if (e.message.includes('status 400') || e.message.includes('status 422')) {
                return {
                    content: [{ 
                        type: 'text', 
                        text: `State transition error: The transition from current state to '${targetState}' may not be valid for work item ${dbid}. Error: ${e.message}` 
                    }]
                };
            } else {
                return {
                    content: [{ 
                        type: 'text', 
                        text: `Error changing work item state: ${e.message}` 
                    }]
                };
            }
        }
    }
);


const transport = new StdioServerTransport();
await server.connect(transport);


//Request body to create work item
const createWorkItemBody = `
{
  "dbId": "33554505",
  "displayName": "string",
  "entityDefName": "Project",
  "fields": [
      {
      "name": "Component",
      "value": "",
      "valueStatus": "HAS_VALUE",
      "validationStatus": "_KNOWN_VALID",
      "requiredness": "READONLY",
      "requirednessForUser": "READONLY",
      "type": "REFERENCE",
      "valueAsList": [
        ""
      ],
      "messageText": "",
      "maxLength": 0
    },
    {
      "name": "dbid",
      "value": "33554505",
      "valueStatus": "HAS_VALUE",
      "validationStatus": "_KNOWN_VALID",
      "requiredness": "READONLY",
      "requirednessForUser": "READONLY",
      "type": "DBID",
      "valueAsList": [
        "33554505"
      ],
      "messageText": "",
      "maxLength": 0
    },
    {
      "name": "Project",
      "value": "Devops Code",
      "valueStatus": "HAS_VALUE",
      "validationStatus": "_KNOWN_VALID",
      "requiredness": "READONLY",
      "requirednessForUser": "READONLY",
      "type": "REFERENCE",
      "valueAsList": [
        "Devops Code"
      ],
      "messageText": "",
      "maxLength": 0
    },
    {
      "name": "record_type",
      "value": "WorkItem",
      "valueStatus": "HAS_VALUE",
      "validationStatus": "_KNOWN_VALID",
      "requiredness": "READONLY",
      "requirednessForUser": "READONLY",
      "type": "RECORDTYPE",
      "valueAsList": [
        "WorkItem"
      ],
      "messageText": "",
      "maxLength": 30
    },
    {
      "name": "Title",
      "value": "Plan Item",
      "valueStatus": "HAS_VALUE",
      "validationStatus": "_KNOWN_VALID",
      "requiredness": "READONLY",
      "requirednessForUser": "READONLY",
      "type": "SHORT_STRING",
      "valueAsList": [
        "Plan Item"
      ],
      "messageText": "",
      "maxLength": 254
    },
	{
      "name": "Description",
      "value": "Plan Item",
      "valueStatus": "HAS_VALUE",
      "validationStatus": "_KNOWN_VALID",
      "requiredness": "READONLY",
      "requirednessForUser": "READONLY",
      "type": "MULTILINE_STRING",
      "valueAsList": [
        "Plan Item"
      ],
      "messageText": "",
      "maxLength": 0
    },
    {
      "name": "WIType",
      "value": "Task",
      "valueStatus": "HAS_VALUE",
      "validationStatus": "_KNOWN_VALID",
      "requiredness": "READONLY",
      "requirednessForUser": "READONLY",
      "type": "SHORT_STRING",
      "valueAsList": [
        "Task"
      ],
      "messageText": "",
      "maxLength": 254
    }
  ],
  "legalActions": [
    {
      "actionName": "Submit",
      "formDefName": "Defect_Base_Submit"
    }
  ],
  "isEditable": true,
  "isDuplicate": true,
  "original": {
    "dbId": "33554524",
    "displayName": "string",
    "entityDefName": "Project",
    "viewURL": "string"
  },
  "isOriginal": true,
  "hasDuplicates": true,
  "errorMessage": "string",
  "duplicates": [
    {
      "child": {
        "dbId": "33554524",
        "displayName": "string",
        "entityDefName": "Project",
        "viewURL": "string"
      },
      "parent": {
        "dbId": "33554524",
        "displayName": "string",
        "entityDefName": "Project",
        "viewURL": "string"
      }
    }
  ],
  "viewURL": "string"
}
`