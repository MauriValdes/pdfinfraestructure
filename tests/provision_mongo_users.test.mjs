import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(
  new URL("../scripts/provision_mongo_users.js", import.meta.url),
  "utf8",
);

function effectiveRole(databaseName) {
  return {
    inheritedRoles: [{ role: "readWrite", db: databaseName }],
    inheritedPrivileges: ["", "system.js"].map((collection) => ({
      resource: { db: databaseName, collection },
      actions: ["find", "insert", "update", "remove"],
    })),
  };
}

function builtinRole(databaseName) {
  const effective = effectiveRole(databaseName);
  return {
    role: "readWrite",
    db: databaseName,
    isBuiltin: true,
    roles: [],
    inheritedRoles: [],
    privileges: structuredClone(effective.inheritedPrivileges),
    inheritedPrivileges: structuredClone(effective.inheritedPrivileges),
  };
}

function userWithApprovedAccess(databaseName) {
  return {
    roles: [{ role: "readWrite", db: databaseName }],
    ...structuredClone(effectiveRole(databaseName)),
  };
}

function runProvisioner({
  users = {},
  passwords = [],
  createFailure = null,
  getUserFailure = null,
  rootSession = true,
  roleOverrides = {},
} = {}) {
  const state = {
    users: structuredClone(users),
    creates: [],
    prompts: [],
    output: [],
    getUserCalls: [],
    getRoleCalls: [],
  };

  const fakeDb = {
    getSiblingDB(databaseName) {
      return {
        runCommand(command) {
          if (command.connectionStatus !== 1 || command.showPrivileges !== false) {
            throw new Error("unexpected connection-status command");
          }
          return {
            ok: 1,
            authInfo: {
              authenticatedUserRoles: rootSession
                ? [{ role: "root", db: "admin" }]
                : [{ role: "readWrite", db: "pdf_database_dev" }],
            },
          };
        },
        getUser(username, options) {
          state.getUserCalls.push({ databaseName, username, options });
          if (getUserFailure === `${databaseName}:${username}`) {
            throw new Error("sensitive simulated getUser error");
          }
          return state.users[databaseName]?.[username] ?? null;
        },
        getRole(roleName, options) {
          state.getRoleCalls.push({ databaseName, roleName, options });
          return roleOverrides[databaseName] ?? builtinRole(databaseName);
        },
        createUser(userDocument) {
          if (createFailure === userDocument.user) {
            throw new Error("sensitive simulated error detail");
          }
          state.creates.push({
            databaseName,
            user: userDocument.user,
            password: userDocument.pwd,
            roles: structuredClone(userDocument.roles),
          });
          state.users[databaseName] ??= {};
          state.users[databaseName][userDocument.user] = {
            roles: structuredClone(userDocument.roles),
          };
          return { ok: 1 };
        },
      };
    },
  };

  let passwordIndex = 0;
  let exitCode = null;
  const context = {
    db: fakeDb,
    print: (message) => state.output.push(message),
    passwordPrompt: (prompt) => {
      state.prompts.push(prompt);
      return passwords[passwordIndex++];
    },
    quit: (code) => {
      exitCode = code;
    },
  };

  vm.runInNewContext(source, context);
  return { ...state, exitCode };
}

const appRoles = [{ role: "readWrite", db: "pdf_database_dev" }];
const testRoles = [{ role: "readWrite", db: "pdf_database_test" }];
const validUsers = {
  pdf_database_dev: {
    pdf_ms3_app: userWithApprovedAccess("pdf_database_dev"),
  },
  pdf_database_test: {
    pdf_ms3_test: userWithApprovedAccess("pdf_database_test"),
  },
};

test("creates both missing users with only their own readWrite role", () => {
  const result = runProvisioner({ passwords: ["app-pass", "test-pass"] });

  assert.equal(result.exitCode, null);
  assert.deepEqual(
    result.creates.map(({ databaseName, user, roles }) => ({
      databaseName,
      user,
      roles,
    })),
    [
      { databaseName: "pdf_database_dev", user: "pdf_ms3_app", roles: appRoles },
      { databaseName: "pdf_database_test", user: "pdf_ms3_test", roles: testRoles },
    ],
  );
  assert.equal(result.prompts.length, 2);
  assert.ok(result.getUserCalls.every((call) => call.options?.showPrivileges === true));
  assert.deepEqual(
    result.getRoleCalls.map(({ databaseName, roleName, options }) => ({
      databaseName,
      roleName,
      options: {
        showPrivileges: options.showPrivileges,
        showBuiltinRoles: options.showBuiltinRoles,
      },
    })),
    [],
  );
});

test("validates MongoDB 8.0 inherited-role shapes and contextual privileges for DEV and TEST", () => {
  const result = runProvisioner({ users: validUsers });

  assert.equal(result.exitCode, null);
  assert.equal(result.creates.length, 0);
  assert.equal(result.prompts.length, 0);
  assert.deepEqual(result.users, validUsers);
  assert.deepEqual(result.users.pdf_database_dev.pdf_ms3_app.inheritedRoles, [
    { role: "readWrite", db: "pdf_database_dev" },
  ]);
  assert.deepEqual(result.users.pdf_database_test.pdf_ms3_test.inheritedRoles, [
    { role: "readWrite", db: "pdf_database_test" },
  ]);
  assert.ok(
    result.users.pdf_database_dev.pdf_ms3_app.inheritedPrivileges.every(
      ({ resource }) => resource.db === "pdf_database_dev",
    ),
  );
  assert.ok(
    result.users.pdf_database_test.pdf_ms3_test.inheritedPrivileges.every(
      ({ resource }) => resource.db === "pdf_database_test",
    ),
  );
  assert.ok(result.getUserCalls.every((call) => call.options?.showPrivileges === true));
  assert.deepEqual(
    result.getRoleCalls.map(({ databaseName, roleName, options }) => ({
      databaseName,
      roleName,
      options: {
        showPrivileges: options.showPrivileges,
        showBuiltinRoles: options.showBuiltinRoles,
      },
    })),
    [
      {
        databaseName: "pdf_database_dev",
        roleName: "readWrite",
        options: { showPrivileges: true, showBuiltinRoles: true },
      },
      {
        databaseName: "pdf_database_test",
        roleName: "readWrite",
        options: { showPrivileges: true, showBuiltinRoles: true },
      },
    ],
  );
});

test("creates only the missing account and does not change the existing user", () => {
  const users = {
    pdf_database_dev: {
      pdf_ms3_app: {
        ...userWithApprovedAccess("pdf_database_dev"),
        marker: "preserve",
      },
    },
  };
  const result = runProvisioner({ users, passwords: ["test-pass"] });

  assert.equal(result.exitCode, null);
  assert.deepEqual(
    result.creates.map(({ databaseName, user }) => ({ databaseName, user })),
    [{ databaseName: "pdf_database_test", user: "pdf_ms3_test" }],
  );
  assert.deepEqual(result.users.pdf_database_dev.pdf_ms3_app, users.pdf_database_dev.pdf_ms3_app);
});

test("aborts without creating users when an account has additional roles", () => {
  const users = {
    pdf_database_dev: {
      pdf_ms3_app: {
        roles: [...appRoles, { role: "dbAdmin", db: "pdf_database_dev" }],
      },
    },
  };
  const result = runProvisioner({ users, passwords: ["test-pass"] });

  assert.equal(result.exitCode, 1);
  assert.equal(result.creates.length, 0);
  assert.match(result.output.join("\n"), /roles distintos/);
});

test("aborts without creating users when a role differs from the approved role", () => {
  const users = {
    pdf_database_dev: {
      pdf_ms3_app: { roles: [{ role: "readWrite", db: "pdf_database_test" }] },
    },
  };
  const result = runProvisioner({ users, passwords: ["test-pass"] });

  assert.equal(result.exitCode, 1);
  assert.equal(result.creates.length, 0);
});

test("aborts if a username exists in the other authentication database", () => {
  const users = {
    pdf_database_test: {
      pdf_ms3_app: userWithApprovedAccess("pdf_database_test"),
    },
  };
  const result = runProvisioner({ users, passwords: ["app-pass", "test-pass"] });

  assert.equal(result.exitCode, 1);
  assert.equal(result.creates.length, 0);
  assert.match(result.output.join("\n"), /base de autenticación inesperada/);
});

test("prevalidates both accounts before creating when the second has a conflict", () => {
  const users = {
    pdf_database_test: {
      pdf_ms3_test: {
        roles: [{ role: "dbAdmin", db: "pdf_database_test" }],
        ...structuredClone(effectiveRole("pdf_database_test")),
      },
    },
  };
  const result = runProvisioner({ users, passwords: ["app-pass"] });

  assert.equal(result.exitCode, 1);
  assert.equal(result.creates.length, 0);
  assert.equal(result.prompts.length, 0);
});

test("does not change existing passwords", () => {
  const result = runProvisioner({
    users: validUsers,
    passwords: ["must-not-be-requested"],
  });

  assert.equal(result.exitCode, null);
  assert.equal(result.creates.length, 0);
  assert.equal(result.prompts.length, 0);
});

test("rejects a session without the root role", () => {
  const result = runProvisioner({ passwords: ["unused"], rootSession: false });

  assert.equal(result.exitCode, 1);
  assert.equal(result.getUserCalls.length, 0);
  assert.equal(result.creates.length, 0);
  assert.equal(result.prompts.length, 0);
});

for (const username of ["pdf_ms3_app", "pdf_ms3_test"]) {
  test(`rejects ${username} when it already exists in admin`, () => {
    const users = {
      admin: {
        [username]: { roles: [{ role: "root", db: "admin" }] },
      },
    };
    const result = runProvisioner({ users, passwords: ["unused", "unused"] });

    assert.equal(result.exitCode, 1);
    assert.equal(result.creates.length, 0);
    assert.equal(result.prompts.length, 0);
    assert.ok(
      result.getUserCalls.some(
        (call) => call.databaseName === "admin" && call.username === username,
      ),
    );
    assert.deepEqual(
      result.getUserCalls
        .filter((call) => call.databaseName === "admin")
        .map((call) => call.username)
        .sort(),
      ["pdf_ms3_app", "pdf_ms3_test"],
    );
  });
}

test("rejects additional inherited roles", () => {
  const user = userWithApprovedAccess("pdf_database_dev");
  user.inheritedRoles.push({ role: "dbAdmin", db: "pdf_database_dev" });
  const result = runProvisioner({
    users: { pdf_database_dev: { pdf_ms3_app: user } },
    passwords: ["unused"],
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.creates.length, 0);
});

test("rejects effective privileges on another database", () => {
  const user = userWithApprovedAccess("pdf_database_dev");
  user.inheritedPrivileges.push({
    resource: { db: "pdf_database_test", collection: "" },
    actions: ["find"],
  });
  const result = runProvisioner({
    users: { pdf_database_dev: { pdf_ms3_app: user } },
    passwords: ["unused"],
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.creates.length, 0);
});

test("rejects additional effective resources in the expected database", () => {
  const user = userWithApprovedAccess("pdf_database_dev");
  user.inheritedPrivileges.push({
    resource: { db: "pdf_database_dev", collection: "extra_collection" },
    actions: ["find"],
  });
  const result = runProvisioner({
    users: { pdf_database_dev: { pdf_ms3_app: user } },
    passwords: ["unused"],
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.creates.length, 0);
});

test("rejects additional effective actions on the expected database", () => {
  const user = userWithApprovedAccess("pdf_database_dev");
  user.inheritedPrivileges[0].actions.push("dropDatabase");
  const result = runProvisioner({
    users: { pdf_database_dev: { pdf_ms3_app: user } },
    passwords: ["unused"],
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.creates.length, 0);
});

test("rejects a built-in role response scoped to admin instead of the target database", () => {
  const role = builtinRole("pdf_database_dev");
  role.db = "admin";
  role.privileges.forEach(({ resource }) => {
    resource.db = "admin";
  });
  role.inheritedPrivileges.forEach(({ resource }) => {
    resource.db = "admin";
  });
  const result = runProvisioner({
    users: { pdf_database_dev: { pdf_ms3_app: userWithApprovedAccess("pdf_database_dev") } },
    passwords: ["unused"],
    roleOverrides: { pdf_database_dev: role },
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.creates.length, 0);
});

test("rejects effective global or cluster privileges", () => {
  for (const resource of [{ cluster: true }, { anyResource: true }]) {
    const user = userWithApprovedAccess("pdf_database_dev");
    user.inheritedPrivileges.push({ resource, actions: ["find"] });
    const result = runProvisioner({
      users: { pdf_database_dev: { pdf_ms3_app: user } },
      passwords: ["unused"],
    });

    assert.equal(result.exitCode, 1);
    assert.equal(result.creates.length, 0);
  }
});

test("sanitizes getUser errors and performs no creation", () => {
  const result = runProvisioner({
    getUserFailure: "pdf_database_dev:pdf_ms3_app",
    passwords: ["unused", "unused"],
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.creates.length, 0);
  assert.doesNotMatch(result.output.join("\n"), /sensitive simulated getUser error/);
});

test("sanitizes failure when creating the first account", () => {
  const result = runProvisioner({
    passwords: ["app-pass", "test-pass"],
    createFailure: "pdf_ms3_app",
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.creates.length, 0);
  assert.doesNotMatch(result.output.join("\n"), /sensitive simulated error detail|app-pass|test-pass/);
  assert.match(result.output.join("\n"), /No se creó ninguna cuenta/);
});

test("keeps an earlier creation if a later creation fails and sanitizes the error", () => {
  const result = runProvisioner({
    passwords: ["app-pass", "test-pass"],
    createFailure: "pdf_ms3_test",
  });

  assert.equal(result.exitCode, 1);
  assert.deepEqual(
    result.creates.map(({ user }) => user),
    ["pdf_ms3_app"],
  );
  assert.doesNotMatch(result.output.join("\n"), /sensitive simulated error detail|app-pass|test-pass/);
  assert.match(result.output.join("\n"), /No se realizó rollback automático/);
});
