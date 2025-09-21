import { motion } from "framer-motion";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Icons,
} from "@wealthfolio/ui";

const features = [
  {
    category: "Community Edition",
    items: [
      { text: "Local-first on your device", icon: Icons.Shield },
      { text: "Manual export/import", icon: Icons.Download },
      { text: "Core portfolio tools", icon: Icons.TrendingUp },
      { text: "Community support", icon: Icons.Users },
    ],
    badge: "Current",
    badgeVariant: "secondary" as const,
    price: "Free",
    period: "forever",
    description: "Your current Wealthfolio experience",
    current: true,
  },
  {
    category: "Wealthfolio Pro",
    items: [
      { text: "Mobile app (iOS & Android)", icon: Icons.Smartphone },
      { text: "Private, peer-to-peer device sync", icon: Icons.Refresh },
      { text: "BYOK AI Assistant (your own key)", icon: Icons.Sparkles },
      { text: "Unlimited devices & background sync", icon: Icons.Wifi },
      { text: "Priority updates & support", icon: Icons.Star },
    ],
    badge: "Upgrade",
    badgeVariant: "default" as const,
    price: "$29.99",
    period: "once",
    description: "Unlock advanced features and mobile access",
    popular: true,
  },
];

const containerVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      staggerChildren: 0.1,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5 },
  },
  hover: {
    y: -8,
    transition: { duration: 0.2 },
  },
};

const featureVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.3 },
  },
};

export function UpgradeCallout() {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="mx-auto w-full max-w-6xl p-6"
    >
      {/* Header */}
      <motion.div className="mb-12 text-center" variants={featureVariants}>
        <h2 className="text-foreground mb-4 text-2xl font-bold text-balance">
          Ready to Unlock More?
        </h2>
        <p className="text-muted-foreground text-md mx-auto max-w-2xl text-balance">
          You're currently using Wealthfolio Community Edition. Upgrade to Pro for mobile access,
          device sync, and advanced features.
        </p>
      </motion.div>

      {/* Plans Grid */}
      <div className="mb-8 grid gap-8 md:grid-cols-2">
        {features.map((plan) => (
          <motion.div
            key={plan.category}
            variants={cardVariants}
            whileHover="hover"
            className="relative"
          >
            <Card
              className={`flex h-full flex-col border-2 transition-all duration-300 ${
                plan.popular
                  ? "border-primary shadow-primary/10 shadow-lg"
                  : plan.current
                    ? "border-muted-foreground/30 bg-muted/20"
                    : "border-border hover:border-primary/50"
              }`}
            >
              {plan.popular && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                  className="absolute -top-3 left-1/2 -translate-x-1/2 transform"
                >
                  <Badge variant="default" className="bg-primary text-primary-foreground px-4 py-1">
                    Recommended
                  </Badge>
                </motion.div>
              )}

              <CardHeader className="pb-4">
                <div className="mb-2 flex items-center justify-between">
                  <CardTitle className="text-xl font-semibold">{plan.category}</CardTitle>
                  <Badge variant={plan.badgeVariant}>{plan.badge}</Badge>
                </div>

                <div className="mb-2 flex items-baseline gap-1">
                  <span className="text-foreground text-3xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground text-sm">{plan.period}</span>
                </div>

                <CardDescription className="text-sm">{plan.description}</CardDescription>
              </CardHeader>

              <CardContent className="flex-1">
                <motion.ul className="space-y-3" variants={containerVariants}>
                  {plan.items.map((item, itemIndex) => (
                    <motion.li
                      key={itemIndex}
                      variants={featureVariants}
                      className="flex items-center gap-3 text-sm"
                    >
                      <div className="flex-shrink-0">
                        <div
                          className={`rounded-md p-1.5 ${
                            plan.popular
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          <item.icon className="h-4 w-4" />
                        </div>
                      </div>
                      <span className="text-foreground leading-relaxed">{item.text}</span>
                    </motion.li>
                  ))}
                </motion.ul>
              </CardContent>

              <CardFooter className="pt-6">
                <Button
                  className={`group w-full ${
                    plan.popular
                      ? "bg-primary hover:bg-primary/90"
                      : plan.current
                        ? "variant-outline cursor-not-allowed opacity-60"
                        : "variant-outline"
                  }`}
                  size="lg"
                  disabled={plan.current}
                >
                  {plan.current ? "Currently Active" : "Upgrade to Pro"}
                  {!plan.current && (
                    <Icons.ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  )}
                </Button>
              </CardFooter>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Bottom CTA */}
      <motion.div variants={featureVariants} className="text-center">
        <p className="text-muted-foreground text-sm">
          Learn more about{" "}
          <a
            href="https://wealthfolio.app/pro"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Wealthfolio Pro edition
          </a>
        </p>
      </motion.div>
    </motion.div>
  );
}
