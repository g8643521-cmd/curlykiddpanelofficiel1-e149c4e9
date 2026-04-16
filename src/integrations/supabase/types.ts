export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      bot_detected_cheaters: {
        Row: {
          detected_at: string
          discord_avatar: string | null
          discord_user_id: string | null
          discord_username: string | null
          guild_id: string | null
          guild_name: string | null
          id: string
          is_flagged: boolean | null
          summary_text: string | null
          total_bans: number | null
          total_tickets: number | null
        }
        Insert: {
          detected_at?: string
          discord_avatar?: string | null
          discord_user_id?: string | null
          discord_username?: string | null
          guild_id?: string | null
          guild_name?: string | null
          id?: string
          is_flagged?: boolean | null
          summary_text?: string | null
          total_bans?: number | null
          total_tickets?: number | null
        }
        Update: {
          detected_at?: string
          discord_avatar?: string | null
          discord_user_id?: string | null
          discord_username?: string | null
          guild_id?: string | null
          guild_name?: string | null
          id?: string
          is_flagged?: boolean | null
          summary_text?: string | null
          total_bans?: number | null
          total_tickets?: number | null
        }
        Relationships: []
      }
      bot_server_settings: {
        Row: {
          created_at: string
          guild_id: string
          id: string
          setting_key: string
          setting_value: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          guild_id: string
          id?: string
          setting_key: string
          setting_value?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          guild_id?: string
          id?: string
          setting_key?: string
          setting_value?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      cheater_reports: {
        Row: {
          created_at: string
          evidence: string | null
          id: string
          reason: string | null
          reported_user: string | null
          reporter_id: string | null
          status: string | null
        }
        Insert: {
          created_at?: string
          evidence?: string | null
          id?: string
          reason?: string | null
          reported_user?: string | null
          reporter_id?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string
          evidence?: string | null
          id?: string
          reason?: string | null
          reported_user?: string | null
          reporter_id?: string | null
          status?: string | null
        }
        Relationships: []
      }
      discord_alerted_members: {
        Row: {
          alerted_at: string
          discord_user_id: string
          guild_id: string
          id: string
          joined_at: string | null
        }
        Insert: {
          alerted_at?: string
          discord_user_id: string
          guild_id: string
          id?: string
          joined_at?: string | null
        }
        Update: {
          alerted_at?: string
          discord_user_id?: string
          guild_id?: string
          id?: string
          joined_at?: string | null
        }
        Relationships: []
      }
      discord_bot_config: {
        Row: {
          bot_avatar: string | null
          bot_discriminator: string | null
          bot_id: string
          bot_username: string | null
          created_at: string
          id: string
          invite_url: string | null
          selected_guild_id: string | null
          selected_guild_name: string | null
          updated_at: string
        }
        Insert: {
          bot_avatar?: string | null
          bot_discriminator?: string | null
          bot_id: string
          bot_username?: string | null
          created_at?: string
          id?: string
          invite_url?: string | null
          selected_guild_id?: string | null
          selected_guild_name?: string | null
          updated_at?: string
        }
        Update: {
          bot_avatar?: string | null
          bot_discriminator?: string | null
          bot_id?: string
          bot_username?: string | null
          created_at?: string
          id?: string
          invite_url?: string | null
          selected_guild_id?: string | null
          selected_guild_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      discord_bot_servers: {
        Row: {
          alert_channel_name: string | null
          auto_scan_webhook_url: string | null
          created_at: string
          full_scan_webhook_url: string | null
          guild_icon: string | null
          guild_id: string
          guild_name: string | null
          id: string
          info_channel_id: string | null
          is_active: boolean | null
          last_checked_at: string | null
          manual_webhook_url: string | null
          member_count: number | null
          user_id: string | null
          webhook_url: string | null
        }
        Insert: {
          alert_channel_name?: string | null
          auto_scan_webhook_url?: string | null
          created_at?: string
          full_scan_webhook_url?: string | null
          guild_icon?: string | null
          guild_id: string
          guild_name?: string | null
          id?: string
          info_channel_id?: string | null
          is_active?: boolean | null
          last_checked_at?: string | null
          manual_webhook_url?: string | null
          member_count?: number | null
          user_id?: string | null
          webhook_url?: string | null
        }
        Update: {
          alert_channel_name?: string | null
          auto_scan_webhook_url?: string | null
          created_at?: string
          full_scan_webhook_url?: string | null
          guild_icon?: string | null
          guild_id?: string
          guild_name?: string | null
          id?: string
          info_channel_id?: string | null
          is_active?: boolean | null
          last_checked_at?: string | null
          manual_webhook_url?: string | null
          member_count?: number | null
          user_id?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      discord_member_joins: {
        Row: {
          discord_avatar: string | null
          discord_user_id: string | null
          discord_username: string | null
          guild_id: string | null
          guild_name: string | null
          id: string
          is_cheater: boolean | null
          is_flagged: boolean | null
          logged_at: string
          summary_text: string | null
          total_bans: number | null
          total_tickets: number | null
        }
        Insert: {
          discord_avatar?: string | null
          discord_user_id?: string | null
          discord_username?: string | null
          guild_id?: string | null
          guild_name?: string | null
          id?: string
          is_cheater?: boolean | null
          is_flagged?: boolean | null
          logged_at?: string
          summary_text?: string | null
          total_bans?: number | null
          total_tickets?: number | null
        }
        Update: {
          discord_avatar?: string | null
          discord_user_id?: string | null
          discord_username?: string | null
          guild_id?: string | null
          guild_name?: string | null
          id?: string
          is_cheater?: boolean | null
          is_flagged?: boolean | null
          logged_at?: string
          summary_text?: string | null
          total_bans?: number | null
          total_tickets?: number | null
        }
        Relationships: []
      }
      fivem_mods: {
        Row: {
          author_notes: string | null
          category_id: string | null
          changelog: string | null
          compatibility: string | null
          created_at: string
          description: string | null
          download_count: number | null
          file_name: string | null
          file_size: number | null
          file_url: string | null
          id: string
          is_featured: boolean | null
          model_url: string | null
          name: string
          requirements: string | null
          screenshots: string[] | null
          status: string | null
          tags: string[] | null
          updated_at: string
          uploaded_by: string | null
          version: string | null
        }
        Insert: {
          author_notes?: string | null
          category_id?: string | null
          changelog?: string | null
          compatibility?: string | null
          created_at?: string
          description?: string | null
          download_count?: number | null
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          is_featured?: boolean | null
          model_url?: string | null
          name: string
          requirements?: string | null
          screenshots?: string[] | null
          status?: string | null
          tags?: string[] | null
          updated_at?: string
          uploaded_by?: string | null
          version?: string | null
        }
        Update: {
          author_notes?: string | null
          category_id?: string | null
          changelog?: string | null
          compatibility?: string | null
          created_at?: string
          description?: string | null
          download_count?: number | null
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          is_featured?: boolean | null
          model_url?: string | null
          name?: string
          requirements?: string | null
          screenshots?: string[] | null
          status?: string | null
          tags?: string[] | null
          updated_at?: string
          uploaded_by?: string | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fivem_mods_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "mod_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      mod_categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          name: string
          slug: string | null
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          slug?: string | null
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          slug?: string | null
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          created_at: string
          email_notifications: boolean | null
          id: string
          push_notifications: boolean | null
          sound_enabled: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_notifications?: boolean | null
          id?: string
          push_notifications?: boolean | null
          sound_enabled?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_notifications?: boolean | null
          id?: string
          push_notifications?: boolean | null
          sound_enabled?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          badges: string[] | null
          bio: string | null
          created_at: string
          discord_avatar: string | null
          discord_user_id: string | null
          discord_username: string | null
          display_name: string | null
          email: string | null
          flagged_at: string | null
          flagged_reason: string | null
          id: string
          level: number | null
          risk_score: number | null
          role: string | null
          status: string | null
          suspended_at: string | null
          suspended_reason: string | null
          theme: string | null
          updated_at: string
          user_id: string
          xp: number | null
        }
        Insert: {
          avatar_url?: string | null
          badges?: string[] | null
          bio?: string | null
          created_at?: string
          discord_avatar?: string | null
          discord_user_id?: string | null
          discord_username?: string | null
          display_name?: string | null
          email?: string | null
          flagged_at?: string | null
          flagged_reason?: string | null
          id?: string
          level?: number | null
          risk_score?: number | null
          role?: string | null
          status?: string | null
          suspended_at?: string | null
          suspended_reason?: string | null
          theme?: string | null
          updated_at?: string
          user_id: string
          xp?: number | null
        }
        Update: {
          avatar_url?: string | null
          badges?: string[] | null
          bio?: string | null
          created_at?: string
          discord_avatar?: string | null
          discord_user_id?: string | null
          discord_username?: string | null
          display_name?: string | null
          email?: string | null
          flagged_at?: string | null
          flagged_reason?: string | null
          id?: string
          level?: number | null
          risk_score?: number | null
          role?: string | null
          status?: string | null
          suspended_at?: string | null
          suspended_reason?: string | null
          theme?: string | null
          updated_at?: string
          user_id?: string
          xp?: number | null
        }
        Relationships: []
      }
      scan_history: {
        Row: {
          created_at: string
          duration_seconds: number | null
          finished_at: string | null
          guild_id: string | null
          guild_name: string | null
          id: string
          scan_type: string | null
          server_id: string | null
          started_at: string | null
          status: string | null
          total_alerts: number | null
          total_checked: number | null
          total_failed: number | null
          total_members: number | null
          total_skipped: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          finished_at?: string | null
          guild_id?: string | null
          guild_name?: string | null
          id?: string
          scan_type?: string | null
          server_id?: string | null
          started_at?: string | null
          status?: string | null
          total_alerts?: number | null
          total_checked?: number | null
          total_failed?: number | null
          total_members?: number | null
          total_skipped?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          finished_at?: string | null
          guild_id?: string | null
          guild_name?: string | null
          id?: string
          scan_type?: string | null
          server_id?: string | null
          started_at?: string | null
          status?: string | null
          total_alerts?: number | null
          total_checked?: number | null
          total_failed?: number | null
          total_members?: number | null
          total_skipped?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      search_history: {
        Row: {
          created_at: string
          id: string
          query: string
          search_type: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          query: string
          search_type?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          query?: string
          search_type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      server_favorites: {
        Row: {
          created_at: string
          id: string
          server_id: string
          server_name: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          server_id: string
          server_name?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          server_id?: string
          server_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      server_shares: {
        Row: {
          created_at: string
          id: string
          permission: string | null
          server_id: string
          shared_by: string | null
          shared_with: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          permission?: string | null
          server_id: string
          shared_by?: string | null
          shared_with?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          permission?: string | null
          server_id?: string
          shared_by?: string | null
          shared_with?: string | null
        }
        Relationships: []
      }
      user_flags: {
        Row: {
          created_at: string
          flag_type: string
          flagged_by: string | null
          id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          flag_type: string
          flagged_by?: string | null
          id?: string
          reason?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          flag_type?: string
          flagged_by?: string | null
          id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visitor_logs: {
        Row: {
          created_at: string
          id: string
          ip_address: string | null
          page: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: string | null
          page?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string | null
          page?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_cheater_stats: { Args: never; Returns: Json }
      get_public_tables: {
        Args: never
        Returns: {
          table_name: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "moderator"
        | "user"
        | "owner"
        | "mod_creator"
        | "integrations_manager"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "moderator",
        "user",
        "owner",
        "mod_creator",
        "integrations_manager",
      ],
    },
  },
} as const
