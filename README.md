Title:

AI-Powered Banking Data Assistant
     .Enabling Natural Language Interaction with Structured Banking Data

Problem Statement:

Banking systems manage large volumes of structured data across multiple relational entities such as customers, accounts, and transactions. Business teams frequently require access to operational and transactional data for monitoring, compliance, auditing, and decision-making.
However, accessing this data typically requires technical expertise in database querying and system knowledge — creating delays and dependency on engineering teams. Non-technical stakeholders such as auditors, compliance officers, and business analysts are unable to retrieve data independently, slowing down critical decision-making processes.
This project addresses that gap by designing and developing an AI-Powered Banking Data Assistant that allows users to retrieve banking data through natural language interaction. The system accurately interprets user queries, generates validated SQL, and retrieves correct data from a structured relational database — while ensuring secure and read-only query execution.

Core Domain Context

The banking system includes three relational entities:

.Customers — individuals who hold one or more bank accounts
.Accounts — financial accounts belonging to a customer (savings or current)
.Transactions — credit or debit activities recorded against an account

The assistant must understand the relationships between these entities to correctly resolve queries that span multiple tables — for example, finding all customers who made high-value transactions this week.
