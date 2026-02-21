# AI-Powered Banking Data Assistant  
### Enabling Natural Language Interaction with Structured Banking Data

---

## 📌 Problem Statement

Banking systems manage large volumes of structured data across multiple relational entities such as **customers**, **accounts**, and **transactions**.  

Business teams frequently require access to operational and transactional data for:

- Monitoring operations  
- Regulatory compliance  
- Auditing processes  
- Business decision-making  

However, accessing this data typically requires **technical expertise in SQL querying** and deep system knowledge. This creates delays and dependency on engineering teams.

As a result, non-technical stakeholders such as:

- Auditors  
- Compliance Officers  
- Business Analysts  

are unable to independently retrieve required data, slowing down critical decision-making processes.

This project addresses the gap by designing and developing an **AI-Powered Banking Data Assistant** that enables users to retrieve banking data using **natural language interaction**.

The system will:

- Interpret user queries written in natural language  
- Generate **validated SQL queries**  
- Retrieve accurate results from a structured relational database  
- Ensure **secure and read-only query execution**

---

## 🏦 Core Domain Context

The banking system consists of three primary relational entities:

### 1. Customers
Individuals who hold one or more bank accounts.

### 2. Accounts
Financial accounts belonging to customers, such as:
- Savings Accounts  
- Current Accounts  

### 3. Transactions
Credit or debit activities recorded against an account.

---

## 🔗 Relationship Understanding Requirement

The assistant must understand relationships between entities to correctly resolve multi-table queries.

**Example Query:**
> Find all customers who made high-value transactions this week.

This requires:
- Linking **Customers → Accounts → Transactions**
- Applying filters based on transaction value and time period

---

## 🎯 Project Goal

Build an intelligent assistant that enables **secure, accurate, and self-service data access** for banking stakeholders through natural language queries.