// Scribe – type declarations for use with roblox-ts.
//
// How to use:
//   1. Copy the Scribe `src` Luau files into your project (for example under
//      `src/shared/Scribe`, synced with Rojo).
//   2. Point your import at the Scribe module and keep this file beside it so
//      roblox-ts picks it up (an `init.luau` pairs with an `index.d.ts`).
//   3. Build a bundle once, then use `.Server` on the server and `.Client` on
//      the client, from the same shared module.
//
//   import Scribe from "shared/Scribe";
//   const bundle = Scribe({ Template: { Coins: 0 }, ProfileStoreIndex: "PlayerData", ProfileKeyPrefix: "PLAYER_" });
//   bundle.Server.WaitForData(player);
//
// Note on typing: the Luau side builds the exact per-field accessor tree at
// type-check time (a Luau type function). That has no direct TypeScript twin,
// so this file uses a practical generic model instead – your `Template` type
// flows through `ScribeOptions<T>` into `Bundle<T>`, and every field is
// wrapped in `ScribeValue<T>`. All common methods live on one interface so
// normal reads, writes, and observes type-check without solver cost. Anything
// Luau-only (buffers on the wire, metatable brands) is `unknown` or `any`.

// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------

declare namespace Scribe {
	/** A function that removes a listener or sink. */
	export type Disconnect = () => void;

	/** Path segments used by ops and exchange legs. */
	export type PathSegment = string | number;
	export type Path = Array<PathSegment>;

	export type OpKind = "Init" | "Set" | "Insert" | "Remove" | "Clear";
	export interface Op {
		Kind: OpKind;
		Path: Path;
		Value?: unknown;
		Index?: number;
	}

	export interface ScribeTransport {
		Name: string;
		MaxFrameBytes?: number;
		SendToClient: (self: unknown, player: Player, bytes: buffer) => void;
		SendToAllClients?: (self: unknown, bytes: buffer) => void;
		ListenServer: (
			self: unknown,
			callback: (player: Player, bytes: buffer) => void,
		) => void;
		SendToServer: (self: unknown, bytes: buffer) => void;
		ListenClient: (self: unknown, callback: (bytes: buffer) => void) => void;
		Release?: (self: unknown) => void;
	}

	export type LogLevel = "Debug" | "Info" | "Warn" | "Error" | "Fatal";
	export type LogCategory =
		| "Persistence"
		| "Replication"
		| "Transport"
		| "Commands"
		| "Leaderboards"
		| "Monetization"
		| "Gifting"
		| "Integrity"
		| "Lifecycle"
		| "Derived"
		| "Exchanges";

	export type LogCode = string;
	export interface LogEntry {
		At: number;
		Level: LogLevel;
		Category: LogCategory;
		Code: LogCode;
		Message: string;
		Context?: Map<string, unknown>;
	}

	export type Status = "Healthy" | "Degraded" | "Outage";
	export type SessionState = "Loading" | "Ready" | "SessionEnded";

	export type LifecycleReason =
		| "load-failed"
		| "migration-failed"
		| "session-ended"
		| "player-left"
		| "shutdown"
		| "still-loading"
		| "timeout";

	export type RequestReason =
		| "rate-limited"
		| "not-ready"
		| "unknown-command"
		| "bad-args"
		| "bad-idempotency-key"
		| "error"
		| "reply-encode-failed"
		| "timeout"
		| "send-failed"
		| "edit-mode"
		| "mock-error";

	export type ProductState =
		| "purchasable"
		| "owned"
		| "paid-random-restricted"
		| "policy-pending"
		| "not-loaded";

	export type PurchaseReason =
		| "player data not loaded"
		| "invalid Cost spec"
		| "invalid Cost amount"
		| "invalid cost path"
		| "cost path is not a spendable number"
		| "insufficient funds"
		| "paid-random-restricted"
		| "policy-pending";

	export type GiftReason = string;

	export interface SaveInfo {
		LastSaveAt?: number;
		LastResult?: "Ok" | "Fail";
		Dirty: boolean;
		Size?: number;
	}

	export type Visibility = "Replicated" | "ServerOnly" | "Shared";

	export interface BigScore {
		M: number;
		E: number;
		Short: (self: unknown, decimals?: number) => string;
		ToNumber: (self: unknown) => number;
		Log10: (self: unknown) => number;
	}

	export interface LeaderboardEntry {
		Rank: number;
		UserId: number;
		Name: string;
		Score: number | BigScore;
	}

	export interface LeaderboardConfig {
		Stat: string;
		Limit?: number;
		Scale?: number;
		SigFigs?: number;
		Replicate?: boolean;
		RefreshInterval?: number;
		StoreName?: string;
	}

	export interface ProductConfig<T = unknown> {
		Id: number;
		Category?: string;
		Grant?: (data: PlayerData<T>) => void;
		Grants?: string;
		PaidRandom?: boolean;
	}

	export interface PassConfig {
		Id: number;
		Category?: string;
	}

	export interface PurchaseSpec<T = unknown> {
		Cost: { Path: string; Amount: number };
		Category?: string;
		ItemId: string;
		Grant?: (data: PlayerData<T>) => void;
		Meta?: Map<string, unknown>;
		IdempotencyKey?: string;
		PaidRandom?: boolean;
	}

	export interface PurchaseFilter {
		Kind?: "Robux" | "InGame";
		Category?: string;
		ItemId?: string;
		Since?: number;
		Limit?: number;
	}

	export interface EconomyMeta {
		Flow?: "Source" | "Sink";
		TransactionType?: string;
		ItemSku?: string;
		Currency?: string;
		Fields?: Map<string, unknown>;
		Source?: string;
		Item?: string;
	}

	export type EconomyFieldSpec = string | { Name: string; Prefix?: boolean };

	export interface EconomyCurrencyConfig {
		Label?: string;
		Fields?: Array<EconomyFieldSpec>;
		Resolve?: (player: Player) => Map<string, unknown>;
	}

	export type EconomyLogFn = (
		player: Player,
		flowType: unknown,
		currencyType: string,
		amount: number,
		endingBalance: number,
		transactionType: string,
		itemSku: string | undefined,
		customFields: Map<string, unknown> | undefined,
	) => void;

	export interface EconomyConfig {
		Resolve?: (player: Player) => Map<string, unknown>;
		Prefix?: boolean;
		Currencies?: Map<string, EconomyCurrencyConfig>;
		LogEconomyEvent?: EconomyLogFn;
	}

	// ---------------------------------------------------------------------------
	// Declarator wrappers and option tables
	// ---------------------------------------------------------------------------

	/** A field with an expiry (see `Scribe.Timed`). Reads back as `T`. */
	export type Timed<T> = T;
	/** A named-boolean set; reads back as the enabled member names. */
	export type Flags = Array<string>;
	/** A unique-member set; reads back as its members. */
	export type SetOf<T> = Array<T>;
	/** A field that never leaves the server. */
	export type ServerOnly<T> = T;
	/** A computed field; read-only at runtime. */
	export type Derived<T> = T;
	/** A keyed map with a declared key type. */
	export type MapOf<K, V> = Map<K, V>;

	export interface NumberMeta {
		Min?: number;
		Max?: number;
	}
	export interface FloatMeta {
		Min?: number;
		Max?: number;
		Precision?: number | "f32";
	}
	export interface BigMeta {
		Min?: number | string;
		Max?: number | string;
	}
	export interface StringMeta {
		MaxLength?: number;
	}
	export interface CFrameMeta {
		Precision?: "exact";
	}
	export interface ArrayOpts {
		MaxItems?: number;
		Evict?: "Front" | "Back";
	}
	export interface SetOpts {
		MaxItems?: number;
	}
	export interface DictOpts {
		MaxKeys?: number;
		MaxKeyLength?: number;
	}
	export type MapKeyType = "integer" | "string";
	export interface CooldownOptions {
		IncludeOfflineTime?: boolean;
	}

	/** What a `Scribe.Big` field reads back. Supports `+ - * /` and comparisons. */
	export interface BigValue {
		M: number;
		E: number;
		Short: (self: unknown, decimals?: number) => string;
		ToNumber: (self: unknown) => number;
		Pow: (self: unknown, n: number) => BigValue;
		Log10: (self: unknown) => number;
	}

	export interface ExchangeableSpec {
		Path: Array<string>;
		Kind: "Key" | "Qty" | "Stack";
		Count?: string;
		Identity?: Array<string>;
		Ignore?: Array<string>;
	}

	export interface ExchangeLeg {
		Path: Array<string>;
		Kind: "Key" | "Qty" | "Stack";
		Key?: unknown;
		Amount?: number;
	}

	export interface OpenLeg {
		Path: Array<PathSegment>;
		Kind: string;
		Key?: unknown;
		Amount?: number;
	}

	export interface OpenExchange {
		Id: string;
		State: "Claimed" | "Staked" | "Delivering";
		Partner?: number;
		Staked: Array<OpenLeg>;
		Owed: Array<OpenLeg>;
		Since?: number;
	}

	export interface MigrationContext {
		AwaitBudget: (
			requestType: string,
			count?: number,
			timeout?: number,
		) => LuaTuple<[boolean, () => void]>;
	}

	export interface BudgetSnapshot {
		Available: boolean;
		Reason?: string;
		Budgets: Map<string, number>;
		At: number;
	}

	// ---------------------------------------------------------------------------
	// The typed accessor tree (generic passthrough model)
	// ---------------------------------------------------------------------------

	/**
	 * One field in the typed tree. `T` is the field value type (`Get` shape).
	 * All method groups live here on purpose: Luau narrows them per declarator,
	 * but in TypeScript they are optional members so normal use type-checks
	 * without heavy conditional types.
	 */
	export interface ScribeValue<T = unknown> {
		// Core reads and writes
		Get: () => T;
		Set: (value: T, silent?: boolean) => T;
		Update: (fn: (value: T) => T, silent?: boolean) => T;
		Clone: () => T;
		Default: () => T;
		Changed: (fn: (value: T, old: T) => void) => Disconnect;
		Observe: (fn: (value: T) => void) => Disconnect;
		OnChildChanged: (
			fn: (key: string, value: unknown, old: unknown) => void,
		) => Disconnect;

		// Numbers and booleans
		Increment: (n: number, meta?: EconomyMeta) => number;
		Decrement: (n: number, meta?: EconomyMeta) => number;
		Toggle: (silent?: boolean) => boolean;
		Min: () => number | string | undefined;
		Max: () => number | string | undefined;

		// Big numbers only
		Multiply: (n: number | string | BigValue, silent?: boolean) => BigValue;
		Divide: (n: number | string | BigValue, silent?: boolean) => BigValue;

		// Arrays
		Insert: (value: unknown, index?: number, silent?: boolean) => void;
		Remove: (index?: number | string, silent?: boolean) => unknown;
		RemoveValue: (
			value: unknown,
			silent?: boolean,
		) => LuaTuple<[unknown, number | undefined]>;
		Find: (value: unknown) => number | undefined;
		Has: (value: unknown) => boolean;
		OnInsert: (fn: (value: never, index: number) => void) => Disconnect;
		OnRemove: (fn: (value: never, index: number) => void) => Disconnect;

		// Dicts, maps, sets, flags
		OnKeyAdded: (fn: (key: never, value: never) => void) => Disconnect;
		OnKeyRemoved: (fn: (key: never, value: never) => void) => Disconnect;
		Add: (value: never, silent?: boolean) => boolean;
		Enable: (name: string, silent?: boolean) => void;
		Disable: (name: string, silent?: boolean) => void;
		Clear: (silent?: boolean) => void;
		Count: () => number;

		// Timed fields
		SetTimed: (value: T, seconds: number, silent?: boolean) => void;
		ExtendTimed: (seconds: number, silent?: boolean) => void;
		Active: () => LuaTuple<[boolean, number | undefined]>;
	}

	/**
	 * Values that never gain child accessors. Records (nested tables) are
	 * container nodes instead: they carry the same methods plus one accessor
	 * per child field. Roblox datatypes are leaves even though they are
	 * objects at runtime.
	 */
	export type LeafValue =
		| string
		| number
		| boolean
		| undefined
		| BigValue
		| ReadonlyArray<unknown>
		| ReadonlyMap<unknown, unknown>
		| Vector3
		| Vector2
		| Vector3int16
		| Vector2int16
		| CFrame
		| Color3
		| BrickColor
		| UDim
		| UDim2
		| Rect
		| NumberRange
		| NumberSequence
		| ColorSequence
		| DateTime
		| EnumItem
		| Font
		| PhysicalProperties;

	/** One node in the tree: a leaf value, or a container with children. */
	export type DataNode<T> = T extends LeafValue
		? ScribeValue<T>
		: ScribeValue<T> & PlayerData<T>;

	/** One player's typed tree: each template field becomes an accessor. */
	export type PlayerData<T> = { [K in keyof T]: DataNode<T[K]> };

	// ---------------------------------------------------------------------------
	// Server and client Data APIs
	// ---------------------------------------------------------------------------

	export interface VersionRecord {
		VersionId: string;
		CreatedAt: number;
		Size?: number;
	}

	export interface CommandSpec {
		Args?: Array<unknown>;
		Idempotent?: boolean;
	}

	export interface Signal<
		T extends (...args: Array<never>) => void = (...args: Array<never>) => void,
	> {
		Connect: (fn: T) => Disconnect;
		Once: (fn: T) => Disconnect;
		Wait: () => void;
		HasListeners?: () => boolean;
	}

	export interface ServerExchange {
		Attempt: (
			playerA: Player,
			basketA: Array<ExchangeLeg>,
			playerB: Player,
			basketB: Array<ExchangeLeg>,
		) => LuaTuple<["Committed" | "Aborted" | undefined, string | undefined]>;
		Open: (player: Player) => Array<OpenExchange>;
		Discard: (exchangeId: string) => LuaTuple<[boolean, string | undefined]>;
		Settle: (
			exchangeId: string,
			verdict: string,
		) => LuaTuple<[boolean, string | undefined]>;
		Redirect: (
			exchangeId: string,
			userId: number,
			newKey: string,
		) => LuaTuple<[boolean, string | undefined]>;
	}

	/** The `.Server` half of the bundle. Index with a Player for their tree. */
	export type ServerData<T> = PlayerData<T> & {
		Get: (player: Player) => PlayerData<T>;
		WaitForData: (
			player: Player,
			timeout?: number,
		) => LuaTuple<[PlayerData<T> | undefined, LifecycleReason | undefined]>;
		GetState: (player: Player) => LuaTuple<[SessionState, string | undefined]>;

		Batch: (player: Player, fn: () => void) => void;
		Transaction: (
			player: Player,
			fn: () => void,
		) => LuaTuple<[boolean, string | undefined]>;

		Flush: (
			player: Player,
			opts?: { Force?: boolean; Timeout?: number },
		) => boolean;
		GetSaveInfo: (player: Player) => SaveInfo;
		GetOffline: (userId: number) => Map<string, unknown> | undefined;
		UpdateOffline: (
			userId: number,
			fn: (data: Map<string, unknown>) => void,
		) => LuaTuple<[boolean, string | undefined]>;
		ListVersions: (userId: number, limit?: number) => Array<VersionRecord>;
		GetVersion: (
			userId: number,
			versionId: string,
		) => Map<string, unknown> | undefined;
		RestoreVersion: (
			userId: number,
			versionId: string,
			opts?: { RollBackReserved?: boolean },
		) => LuaTuple<[boolean, string | undefined]>;
		Erase: (userId: number) => LuaTuple<[boolean, string | undefined]>;
		Export: (userId: number) => string | undefined;

		Command: (
			name: string,
			specOrHandler:
				| CommandSpec
				| ((player: Player, ...args: Array<unknown>) => unknown),
			handler?: (player: Player, ...args: Array<unknown>) => unknown,
		) => void;
		Exchange: ServerExchange;

		GetLeaderboard: (name: string, limit?: number) => Array<LeaderboardEntry>;
		GetMyRank: (player: Player, name: string) => number | undefined;

		PromptPurchase: (
			player: Player,
			name: string,
		) => LuaTuple<[boolean, string | undefined]>;
		PromptGift: (
			buyer: Player,
			productName: string,
			recipientUserId: number,
		) => LuaTuple<[boolean, string | undefined]>;
		GetProductState: (player: Player, name: string) => ProductState;
		GetGiftCredits: (player: Player) => Map<string, number>;
		HandleReceipt: (receiptInfo: Map<string, unknown>) => unknown;
		TryHandleReceipt: (receiptInfo: Map<string, unknown>) => unknown | undefined;
		Owns: (player: Player, key: string) => boolean;
		OwnsAsync: (player: Player, key: string, timeout?: number) => boolean;
		ObserveOwned: (
			player: Player,
			key: string,
			callback: (owned: boolean) => void,
		) => Disconnect;
		GrantPerk: (player: Player, key: string) => void;
		RevokePerk: (player: Player, key: string) => void;
		Purchase: (
			player: Player,
			spec: PurchaseSpec<T>,
		) => LuaTuple<[boolean, string | undefined]>;
		RecordPurchase: (player: Player, entry: Map<string, unknown>) => void;
		GetPurchases: (
			player: Player,
			filter?: PurchaseFilter,
		) => Array<Map<string, unknown>>;

		OnCooldown: (
			player: Player,
			key: string,
			seconds: number,
			opts?: CooldownOptions,
		) => LuaTuple<[boolean, number]>;
		PeekCooldown: (player: Player, key: string) => LuaTuple<[boolean, number]>;
		ClearCooldown: (player: Player, key: string) => void;

		OnSave: Signal;
		SessionEnded: Signal;
		OnAnomaly: Signal;
		OnOwnershipChanged: Signal;
		OnCooldownEnded: Signal;
		OnLeaderboard: Signal;
		OnGiftReceived: Signal;
		OnGiftCredit: Signal;
		OnMessage: Signal;

		SendMessage: (userId: number, message: unknown) => boolean;
		ProfileStore: unknown;
		Raw: unknown;
		ServerStore: unknown;

		Stop: () => void;
	};

	/** The `.Client` half of the bundle. Also carries the local tree at top level. */
	export type ClientData<T> = PlayerData<T> & {
		IsReady: () => boolean;
		WaitForData: (timeout?: number) => boolean;
		Request: (name: string, ...args: Array<unknown>) => unknown;
		RequestOnce: (name: string, key: string, ...args: Array<unknown>) => unknown;

		GetLeaderboard: (name: string, limit?: number) => Array<LeaderboardEntry>;
		GetMyRank: (name: string) => number | undefined;
		OnLeaderboard: Signal;

		GetServiceStatus: () => Status;
		OnServiceStatus: Signal;

		GetShared: (
			playerOrUserId: Player | number,
		) => Map<string, unknown> | undefined;
		OnSharedChanged: Signal;
		OnOwnershipChanged: Signal;

		Owns: (key: string) => boolean;
		OwnsAsync: (key: string, timeout?: number) => boolean;
		ObserveOwned: (key: string, callback: (owned: boolean) => void) => Disconnect;

		GetProductInfo: (name: string) => Map<string, unknown> | undefined;
		GetPrice: (name: string) => number | undefined;
		GetProductInfoAsync: (
			name: string,
			timeout?: number,
		) => Map<string, unknown> | undefined;
		GetPriceAsync: (name: string, timeout?: number) => number | undefined;
		ObserveProductInfo: (
			name: string,
			callback: (info: Map<string, unknown> | undefined) => void,
		) => Disconnect;
		GetProductState: (name: string) => ProductState;
		ObserveProductState: (
			name: string,
			callback: (state: ProductState) => void,
		) => Disconnect;
		PrefetchProductInfo: (names?: Array<string>) => void;
		RefreshProductInfo: (name?: string) => void;

		GetSaveInfo: () => SaveInfo;
		GetGiftCredits: () => Map<string, number>;
		GetPurchases: (filter?: PurchaseFilter) => Array<Map<string, unknown>>;

		Mock: (
			values?: Map<string, unknown>,
			scribeState?: Map<string, unknown>,
		) => void;
		MockCommand: (
			name: string,
			handler: (...args: Array<unknown>) => unknown,
		) => void;

		Raw: unknown;
		ServerStore: unknown;
		Stop: () => void;
	};

	export interface Bundle<T> {
		Server: ServerData<T>;
		Client: ClientData<T>;
	}

	// ---------------------------------------------------------------------------
	// Options
	// ---------------------------------------------------------------------------

	export interface ScribeOptions<T> {
		Template: T;
		ServerStore?: Map<string, unknown>;
		Transport?: ScribeTransport | "Default";

		Migrations?: Map<number, (data: Map<string, unknown>) => void>;
		UserOwnsGamePassAsync?: (userId: number, passId: number) => boolean;
		GetProductInfoAsync?: (
			assetId: number,
			infoType: unknown,
		) => Map<string, unknown> | undefined;
		GetPolicyInfoAsync?: (player: Player) => Map<string, unknown> | undefined;
		DevMode?: boolean;
		IsRunning?: boolean;
		MigrationShadow?: boolean;
		ImportLegacyData?: (
			player: Player,
			userId: number,
			migration: MigrationContext,
		) => Map<string, unknown> | undefined;
		MigrationConcurrency?: number;
		OnPlayerInit?: (
			player: Player,
			rawData: Map<string, unknown>,
			isNewProfile: boolean,
			migration: MigrationContext,
		) => void;
		OnPlayerLeaving?: (
			player: Player,
			data: PlayerData<T>,
			reason: LifecycleReason,
		) => void;

		ProfileStoreIndex: string;
		ProfileKeyPrefix: string;
		SaveInterval?: number;
		ProfileStore?: unknown;
		Mode?: "Live" | "Mock" | "NoSave";
		TargetUserId?: number;
		UseMock?: boolean;
		ViewedUserId?: number;
		OverriddenUserId?: number;
		DontSave?: boolean;
		ResetData?: boolean;
		LoadFailurePolicy?: "Kick" | "Wait";
		LoadTimeout?: number;
		VersionAheadPolicy?: "Kick" | "Allow";
		KickOnSessionEnd?: boolean;
		LoadFailureMessage?: string;
		LegacyImportFailureMessage?: string;
		MigrationFailureMessage?: string;
		VersionAheadMessage?: string;
		SchemaFailureMessage?: string;
		RateLimitedMessage?: string;
		SessionEndMessage?: string;
		SessionStolenMessage?: string;
		SessionInterruptedMessage?: string;

		Leaderboards?: Map<string, LeaderboardConfig>;
		Products?: Map<string, ProductConfig<T>>;
		Passes?: Map<string, PassConfig>;
		Perks?: Array<string>;
		OwnReceipts?: boolean;

		Exchangeable?: Map<string, ExchangeableSpec>;
		PurchaseLog?: {
			RobuxCap?: number;
			InGameCap?: number;
			ReplicateRobux?: boolean;
			ReplicateInGame?: boolean;
			PurchaseLogCategories?: Array<string>;
		};

		GiftCooldown?: number;
		GiftMaxPending?: number;
		GiftIntentTTL?: number;
		PurchaseIdTTL?: number;
		MaxProcessedPurchaseIds?: number;
		PurchaseClaimTTL?: number;
		MaxPurchaseClaims?: number;
		AllowDuplicateGifts?: boolean;
		NoGiftIntentPolicy?: "GrantOrCredit" | "Hold";

		Economy?: EconomyConfig;

		CommandRateLimit?: number;
		RequestTimeout?: number;
		MaxInboundBytes?: number;
		MaxInboundRetainedBytes?: number;
		MaxOutboundBytes?: number;
		MaxInboundFrameRate?: number;
		TransportChannel?: string;

		BoundsPolicy?: "Clamp" | "Reject";
		WipeGuardPolicy?: "Warn" | "Block";
		SchemaPolicy?: "Warn" | "Reject";
		BudgetPolicy?: "Defer";
		WipeGuardShrinkRatio?: number;

		LogLevel?: LogLevel;
		LogRingSize?: number;
		StatusThresholds?: {
			FailWindow?: number;
			FailCount?: number;
			RecoverStreak?: number;
		};
		Banner?: boolean;
	}

	// ---------------------------------------------------------------------------
	// The module itself
	// ---------------------------------------------------------------------------

	export interface ScribeModule {
		// Build
		new: <T>(options: ScribeOptions<T>) => Bundle<T>;
		<T>(options: ScribeOptions<T>): Bundle<T>;

		Version: string;

		// Visibility wrappers
		ServerOnly: <T>(value: T) => ServerOnly<T>;
		Shared: <T>(value: T) => T;
		Session: <T>(value: T) => T;

		// Field declarators
		Int: (value: number, meta?: NumberMeta) => number;
		Number: (value: number, meta?: FloatMeta) => number;
		Big: (value?: number | string, meta?: BigMeta) => BigValue;
		String: (value: string, meta?: StringMeta) => string;
		Enum: (value: string, members: Array<string>) => string;
		Flags: (members: Array<string>) => Flags;
		Timed: <T>(value: T) => Timed<T>;
		Dynamic: <T>(factory: (...args: Array<unknown>) => T) => T;
		Derived: <T>(
			output: T,
			inputs: Array<string>,
			compute: (...args: Array<unknown>) => T,
		) => Derived<T>;
		Optional: <T>(inner: T) => T | undefined;
		ArrayOf: <T>(shape: T, opts?: ArrayOpts) => Array<T>;
		SetOf: <T>(element: T, opts?: SetOpts) => SetOf<T>;
		MapOf: <K, V>(keyType: MapKeyType, value: V, opts?: DictOpts) => MapOf<K, V>;
		DictOf: <V>(shape: V, opts?: DictOpts) => Map<string, V>;

		// Roblox datatype fields
		Vector3: (value: Vector3) => Vector3;
		Vector2: (value: Vector2) => Vector2;
		Vector3int16: (value: Vector3int16) => Vector3int16;
		Vector2int16: (value: Vector2int16) => Vector2int16;
		CFrame: (value: CFrame, meta?: CFrameMeta) => CFrame;
		Color3: (value: Color3) => Color3;
		BrickColor: (value: BrickColor) => BrickColor;
		UDim: (value: UDim) => UDim;
		UDim2: (value: UDim2) => UDim2;
		Rect: (value: Rect) => Rect;
		NumberRange: (value: NumberRange) => NumberRange;
		NumberSequence: (value: NumberSequence) => NumberSequence;
		ColorSequence: (value: ColorSequence) => ColorSequence;
		DateTime: (value: DateTime) => DateTime;
		EnumItem: (value: EnumItem) => EnumItem;
		Font: (value: Font) => Font;
		PhysicalProperties: (value: PhysicalProperties) => PhysicalProperties;
		Datatypes: {
			Pack: (name: string, value: unknown, precision?: string) => buffer;
			Unpack: (name: string, packed: buffer) => unknown;
			IsSupported: (name: string) => boolean;
			PrecisionValues: (name: string) => Array<string> | undefined;
		};

		// Helpers
		Short: (value: number | BigValue | undefined, decimals?: number) => string;
		SetShortSuffixes: (suffixes: Array<string>) => void;
		Configure: (config: { AutoSaveInterval?: number }) => void;

		// Reason and state tables
		Reason: {
			LoadFailed: LifecycleReason;
			MigrationFailed: LifecycleReason;
			SessionEnded: LifecycleReason;
			PlayerLeft: LifecycleReason;
			Shutdown: LifecycleReason;
			StillLoading: LifecycleReason;
			Timeout: LifecycleReason;
		};
		RequestReason: {
			RateLimited: RequestReason;
			NotReady: RequestReason;
			UnknownCommand: RequestReason;
			BadArgs: RequestReason;
			BadIdempotencyKey: RequestReason;
			Error: RequestReason;
			ReplyEncodeFailed: RequestReason;
			Timeout: RequestReason;
			SendFailed: RequestReason;
			EditMode: RequestReason;
			MockError: RequestReason;
		};
		RequestFailed: unknown;
		PurchaseReason: {
			DataNotLoaded: PurchaseReason;
			InvalidCostSpec: PurchaseReason;
			InvalidCostAmount: PurchaseReason;
			InvalidCostPath: PurchaseReason;
			CostPathNotSpendable: PurchaseReason;
			InsufficientFunds: PurchaseReason;
			PaidRandomRestricted: PurchaseReason;
			PolicyPending: PurchaseReason;
		};
		GiftReason: {
			BuyerDataNotLoaded: GiftReason;
			InvalidRecipient: GiftReason;
			CannotGiftYourself: GiftReason;
			GiftCooldown: GiftReason;
			TooManyPending: GiftReason;
			DataServicesDown: GiftReason;
			RecipientAlreadyOwns: GiftReason;
			CreditReserveFailed: GiftReason;
			DeliveryFailed: GiftReason;
			DeliveryUnconfirmed: GiftReason;
			AlreadyPending: GiftReason;
			IntentRecordFailed: GiftReason;
			PaidRandomRestricted: GiftReason;
			PolicyPending: GiftReason;
		};
		ProductState: {
			Purchasable: ProductState;
			Owned: ProductState;
			PaidRandomRestricted: ProductState;
			PolicyPending: ProductState;
			NotLoaded: ProductState;
		};

		// Diagnostics
		GetStatus: () => Status;
		OnStatusChanged: Signal;
		OnIssue: Signal;
		AddLogSink: (fn: (entry: LogEntry) => void) => Disconnect;
		GetRecentLogs: (filter?: {
			Level?: LogLevel;
			Category?: LogCategory;
			Code?: LogCode;
			Limit?: number;
		}) => Array<LogEntry>;
		GetMetrics: () => Map<string, unknown>;
		GetPercentiles: () => Map<string, { P50: number; P90: number; P99: number }>;
		GetBudgetSnapshot: () => BudgetSnapshot;
	}
}

declare const Scribe: Scribe.ScribeModule;
export = Scribe;
