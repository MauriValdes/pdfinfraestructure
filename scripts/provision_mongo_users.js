/*
 * Explicit, idempotent provisioning for the two MS3 MongoDB accounts.
 *
 * Run with mongosh authenticated as the existing root administrator. Passwords
 * are requested interactively and are never accepted as command-line args.
 * This script only creates missing users; it never changes or removes users.
 */

const accounts = [
  {
    username: "pdf_ms3_app",
    database: "pdf_database_dev",
    otherDatabase: "pdf_database_test",
  },
  {
    username: "pdf_ms3_test",
    database: "pdf_database_test",
    otherDatabase: "pdf_database_dev",
  },
];

class ProvisionError extends Error {}

function fail(message) {
  throw new ProvisionError(message);
}

function verifyRootSession() {
  let result;
  try {
    result = db.getSiblingDB("admin").runCommand({
      connectionStatus: 1,
      showPrivileges: false,
    });
  } catch (_error) {
    fail("No se pudo verificar la sesión administrativa; no se modificó ninguna cuenta.");
  }

  const roles = result?.authInfo?.authenticatedUserRoles;
  const isRoot = Array.isArray(roles)
    && roles.some((role) => role.role === "root" && role.db === "admin");
  if (result?.ok !== 1 || !isRoot) {
    fail("La sesión debe estar autenticada como root en admin; no se modificó ninguna cuenta.");
  }
}

function readUser(databaseName, username) {
  try {
    return db.getSiblingDB(databaseName).getUser(username, {
      showPrivileges: true,
    });
  } catch (_error) {
    fail("No se pudieron consultar las cuentas; no se modificó ninguna cuenta.");
  }
}

function readExpectedRole(databaseName) {
  try {
    // Run getRole() in the target database so built-in privileges are scoped
    // to that database rather than the "admin" context.
    return db.getSiblingDB(databaseName).getRole("readWrite", {
      showPrivileges: true,
      showBuiltinRoles: true,
    });
  } catch (_error) {
    fail("No se pudo verificar el rol incorporado; no se modificó ninguna cuenta.");
  }
}

function normalize(value) {
  if (Array.isArray(value)) {
    return value
      .map(normalize)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalize(value[key])])
    );
  }
  return value;
}

function sameStructure(actual, expected) {
  return JSON.stringify(normalize(actual)) === JSON.stringify(normalize(expected));
}

function hasOnlyDatabaseResources(privileges, expectedDatabase) {
  return Array.isArray(privileges)
    && privileges.every((privilege) => {
      const resource = privilege?.resource;
      return resource !== null
        && typeof resource === "object"
        && resource.db === expectedDatabase
        && typeof resource.collection === "string"
        && Object.keys(resource).every((key) => key === "db" || key === "collection")
        && Array.isArray(privilege.actions);
    });
}

function hasExactRoles(user, expectedDatabase) {
  const expectedDirectRoles = [
    { role: "readWrite", db: expectedDatabase },
  ];
  if (
    !Array.isArray(user.roles)
    || !sameStructure(user.roles, expectedDirectRoles)
  ) {
    return false;
  }

  const expectedRole = readExpectedRole(expectedDatabase);
  if (
    expectedRole === null
    || expectedRole.role !== "readWrite"
    || expectedRole.db !== expectedDatabase
    || expectedRole.isBuiltin !== true
    || !Array.isArray(expectedRole.roles)
    || expectedRole.roles.length !== 0
    || !Array.isArray(expectedRole.inheritedRoles)
    || expectedRole.inheritedRoles.length !== 0
    || !hasOnlyDatabaseResources(expectedRole.inheritedPrivileges, expectedDatabase)
    || !Array.isArray(user.inheritedRoles)
    || !Array.isArray(user.inheritedPrivileges)
  ) {
    return false;
  }

  // getRole() describes role inheritance (empty for MongoDB 8.0's built-in
  // readWrite); getUser().inheritedRoles includes the directly assigned role.
  const expectedInheritedRoles = [
    ...expectedDirectRoles,
    ...expectedRole.inheritedRoles,
  ];

  return user.inheritedRoles.every((role) => role.db === expectedDatabase)
    && hasOnlyDatabaseResources(user.inheritedPrivileges, expectedDatabase)
    && sameStructure(user.inheritedRoles, expectedInheritedRoles)
    && sameStructure(user.inheritedPrivileges, expectedRole.inheritedPrivileges);
}

function prevalidateAccounts() {
  const observed = accounts.map((account) => ({
    ...account,
    targetUser: readUser(account.database, account.username),
    otherDatabaseUser: readUser(account.otherDatabase, account.username),
    adminUser: readUser("admin", account.username),
  }));
  const plan = [];

  for (const account of observed) {
    if (account.adminUser !== null && account.adminUser !== undefined) {
      fail(
        `La cuenta ${account.username} ya existe en admin; `
        + "se abortó sin modificar cuentas."
      );
    }
    if (account.otherDatabaseUser !== null && account.otherDatabaseUser !== undefined) {
      fail(
        `La cuenta ${account.username} existe en una base de autenticación inesperada; `
        + "se abortó sin modificar cuentas."
      );
    }

    if (account.targetUser === null || account.targetUser === undefined) {
      plan.push({ ...account, create: true });
      continue;
    }

    if (!hasExactRoles(account.targetUser, account.database)) {
      fail(
        `La cuenta ${account.username} tiene roles distintos de los aprobados; `
        + "se abortó sin modificar cuentas."
      );
    }

    plan.push({ ...account, create: false });
  }

  return plan;
}

function collectPasswords(plan) {
  const missing = plan.filter((account) => account.create);
  for (const account of missing) {
    const password = passwordPrompt(
      `Contraseña nueva para ${account.username} (entrada oculta): `
    );
    if (typeof password !== "string" || password.length === 0) {
      fail("Se recibió una contraseña vacía; no se modificó ninguna cuenta.");
    }
    account.password = password;
  }

  if (missing.length === 2 && missing[0].password === missing[1].password) {
    fail("Las cuentas nuevas deben usar contraseñas distintas; no se modificó ninguna cuenta.");
  }
}

function applyPlan(plan) {
  const created = [];

  for (const account of plan) {
    if (!account.create) {
      print(`Cuenta existente validada sin cambios: ${account.username}.`);
      continue;
    }

    try {
      db.getSiblingDB(account.database).createUser({
        user: account.username,
        pwd: account.password,
        roles: [{ role: "readWrite", db: account.database }],
      });
      created.push(account.username);
      print(`Cuenta creada: ${account.username} en ${account.database}.`);
    } catch (_error) {
      const priorResult = created.length === 0
        ? "No se creó ninguna cuenta en esta ejecución."
        : `Se conservaron sin cambios las cuentas creadas previamente: ${created.join(", ")}.`;
      fail(
        `Falló la creación de ${account.username}. ${priorResult} `
        + "No se realizó rollback automático."
      );
    } finally {
      account.password = undefined;
    }
  }

  print("Aprovisionamiento finalizado; no se modificó la cuenta root.");
}

try {
  verifyRootSession();
  const plan = prevalidateAccounts();
  collectPasswords(plan);
  applyPlan(plan);
} catch (error) {
  const message = error instanceof ProvisionError
    ? error.message
    : "Error inesperado; no se muestran detalles sensibles.";
  print(`Aprovisionamiento abortado: ${message}`);
  quit(1);
}
