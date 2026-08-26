
# Full Stack Developer – Round 1 Technical Assessment

## Customer Application & Workflow Management System

- **Position:** Full Stack Developer
- **Assessment Window:** 2 Calendar Days (48 Hours)
- **Expected Effort:** Approximately 4–6 Hours
- **Submission:** Git Repository
- **AI Usage:** Allowed

---

## 1. Assessment Overview

This assessment is designed to understand how you approach a product requirement and translate it into a working technical solution.

For this assessment, the following technologies are **mandatory**:

- **Next.js**
- **Node.js**

Beyond these requirements, you are free to make your own technical decisions.

The product requirements intentionally focus on **what the application should achieve**, rather than prescribing:

- Database
- Data model
- API structure
- Application architecture
- Authentication mechanism
- Authorization design
- State management
- Styling approach
- Integration pattern
- Testing approach

---

## 2. Product Context

A company manages customer applications that move through multiple operational stages.

Different internal users are responsible for overseeing, assigning, and processing these applications.

Users need a system that allows them to:

- Manage customer information
- Create and track applications
- Assign responsibility
- Track work required for each application
- Monitor progress
- Maintain a history of important activities
- Synchronize selected information with an external system

Your task is to design and build a simplified application that addresses these requirements.

You may make reasonable assumptions where requirements are unclear. Please document important assumptions and decisions.

---

## 3. Users and Access

The application will be used by different types of users with different responsibilities.

At a minimum, consider the following user types.

### Administrator

Responsible for managing the system and should have broad access to users, customers, and applications.

### Manager

Responsible for overseeing work and managing applications handled by a group of users.

### Executive

Responsible for processing applications and completing assigned work.

The application should ensure that users can only view and perform actions appropriate to their responsibilities.

You should determine:

- Appropriate permissions for each user type
- Whether users should belong to a team or group
- How managers should access applications handled by their team
- How application assignment and reassignment should work

Document your decisions and assumptions.

---

## 4. Customer Management

The application should allow users to manage customer information.

Users should be able to:

- Create a customer
- View customer information
- Search for customers
- View applications associated with a customer

A customer may have more than one application.

You should determine what information is required to represent a customer.

---

## 5. Application Management

Users should be able to create and manage customer applications.

An application should contain sufficient information to allow users to understand:

- What the application relates to
- Its current stage
- Its priority
- Who is responsible for it
- When it was created or updated

Users should be able to:

- Create an application
- View application details
- Update relevant application information
- Assign an application to a responsible user
- Reassign an application when required
- Track the current progress of the application

You should determine the appropriate data model and structure.

---

## 6. Workflow and Status Management

Applications move through a processing workflow.

A typical application may go through stages such as:

New
↓
Waiting for Information
↓
In Progress
↓
Under Review
↓
Completed

The application should prevent inappropriate or accidental workflow changes.

You should determine:

- What workflow states are required
- Which transitions are valid
- Whether a completed application can be reopened
- Who is allowed to change the status
- How workflow rules are enforced

Document your assumptions and approach.

---

## 7. Assignment and Work Management

Applications may require one or more pieces of work to be completed.

Examples could include:

- Collecting information
- Verifying submitted information
- Reviewing documentation
- Requesting additional information
- Performing a final review

Users should be able to:

- Create work items associated with an application
- Assign responsibility
- Track progress
- Update work item status
- Mark work as completed

You should determine how work items are represented and managed.

---

## 8. Activity History

Users should be able to understand what has happened to an application over time.

The application should maintain a history of important events.

Examples include:

- Application created
- Application assigned to a user
- Application reassigned
- Application status changed
- Work item created
- Work item completed

The activity history should clearly show:

- What happened
- Who performed the action
- When it occurred

You should determine what information should be stored and how the history should be displayed.

---

## 9. Search and Filtering

As the number of customers and applications grows, users should be able to efficiently find relevant information.

The application should support reasonable capabilities for:

- Searching
- Filtering
- Viewing application lists

You should determine:

- What information should be searchable
- Which filters would be useful
- How larger result sets should be handled

---

## 10. External System Integration

When an application reaches a completed state, selected information needs to be synchronized with an external system.

For this assessment, you may create or simulate a mock external service.

The external system may occasionally:

- Be unavailable
- Return an error
- Respond slowly
- Receive duplicate requests

A failure while synchronizing with the external system should **not prevent the application from being successfully completed in the main application**.

Design an appropriate approach for handling this scenario.

Consider:

- Reliability
- Failure tracking
- Retry mechanisms
- Duplicate synchronization
- Recovery after failure

The implementation approach is your decision.

You are not expected to build unnecessary infrastructure for this assessment. Choose an approach appropriate for the scope and document how you would evolve it for a larger production environment.

---

## 11. User Interface

The application should provide a usable interface for the users described above.

At a minimum, users should be able to:

- Authenticate and access the application
- View relevant customers
- Search and filter applications
- Open and view application details
- Create and update applications
- Assign or reassign responsibility where permitted
- Manage work items
- Update application progress where permitted
- View activity history

The visual design does not need to be highly polished.

Focus on:

- Usability
- Clear information hierarchy
- Functional workflows
- Appropriate loading states
- Appropriate error states

---

## 12. Edge Cases

Some scenarios are intentionally left open for you to consider.

Examples include:

### Concurrent Updates

Two users may open the same application and attempt to update it.

Consider how your system handles conflicting updates or accidental data loss.

### Unauthorized Actions

A user may attempt to access or modify information outside their allowed responsibilities.

### Invalid Workflow Changes

A user may attempt to move an application to an inappropriate stage.

### External System Failures

The external system may fail temporarily after the application has already been completed.

### Duplicate Requests

The same synchronization request may be triggered more than once.

You are not required to solve every possible edge case, but please consider the important ones and document your approach.

---

## 13. Technology Requirements & Technical Decisions

The following technologies are mandatory:

- **Next.js**
- **Node.js**

Beyond this, you are free to choose the technologies and approaches you believe are appropriate.

This includes decisions such as:

- Backend framework or approach
- Database
- Data model
- Application architecture
- API design
- Authentication mechanism
- Authorization approach
- State management
- Styling/UI approach
- External integration approach
- Error handling strategy
- Testing approach

Choose technologies and approaches appropriate for the scope of the assessment.

You are **not expected to use every technology mentioned in the job description**.

Please explain:

- Why you made particular technical choices
- What alternatives you considered
- The trade-offs involved
- Why your solution is appropriate for the scope of the problem

---

## 14. If You Have Additional Time

The core requirements should be prioritized first.

If you complete the core requirements and have additional time, you may implement additional functionality that you believe would improve the application.

Examples could include improvements related to:

- Testing
- Application reliability
- User experience
- Performance
- Security
- Deployment
- Monitoring
- Documentation
- Additional product functionality

This is entirely optional.

Please document:

- What you chose to add
- Why you chose to prioritize it
- Any trade-offs involved

We are interested in your reasoning as much as the feature itself.

---

## 15. Required Deliverables

Please submit a Git repository containing the following.

### Application Source Code

The repository should contain the source code required to run the application.

The application should be runnable using the instructions provided.

### README

Your README should include:

#### Setup Instructions

Explain how to:

1. Clone the repository
2. Configure required environment variables
3. Install dependencies
4. Configure or start required services
5. Run the application

#### Architecture

Briefly explain:

- The high-level architecture
- Major components or modules
- Why you chose the approach

#### Data Model

Explain the key entities and relationships in your application.

A diagram is optional but encouraged.

#### Application Design

Explain important design decisions, including:

- How the frontend and backend communicate
- How application state and business rules are handled
- How workflows are enforced

#### Authentication and Authorization

Explain how users are authenticated and how access is controlled.

#### External Integration

Explain:

- When synchronization occurs
- How failures are handled
- How duplicate synchronization is handled or prevented
- How you would improve the approach for production

#### Assumptions and Trade-offs

Document important assumptions and trade-offs.

#### Incomplete Features

If you did not complete a requirement, briefly explain:

- What remains incomplete
- How you would implement it
- Why you prioritized other areas

#### Production Considerations

Briefly describe what you would improve before deploying the application for broader production use.

---

## 16. AI and Development Tools

You are free to use AI-assisted development tools and other resources during this assessment.

You may use:

- AI coding assistants
- Documentation
- Search engines
- Open-source libraries
- Development frameworks
- Other appropriate tools

Please include a short **AI and Tools Used** section in your README describing:

- Which AI or development tools you used
- Where they were used
---
